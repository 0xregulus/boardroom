import { useCallback, useEffect, useRef, useState } from "react";

import type { WorkflowRunHistoryResponse, WorkflowRunStateEntry } from "../types";
import { asRecord } from "../utils";

interface UseWorkflowRunHistoryResult {
  workflowRunHistoryByDecision: Record<string, WorkflowRunStateEntry[]>;
  workflowRunHistoryLoadingByDecision: Record<string, boolean>;
  workflowRunHistoryErrorByDecision: Record<string, string | null>;
  invalidateDecisionRunHistory: (decisionId: string) => void;
  invalidateAllRunHistory: () => void;
}

interface UseWorkflowRunHistoryParams {
  selectedStrategyId: string | null;
  preloadDecisionIds?: string[];
  preloadLimit?: number;
}

export function useWorkflowRunHistory({
  selectedStrategyId,
  preloadDecisionIds = [],
  preloadLimit = 1,
}: UseWorkflowRunHistoryParams): UseWorkflowRunHistoryResult {
  const [workflowRunHistoryByDecision, setWorkflowRunHistoryByDecision] = useState<Record<string, WorkflowRunStateEntry[]>>({});
  const [workflowRunHistoryLoadingByDecision, setWorkflowRunHistoryLoadingByDecision] = useState<Record<string, boolean>>({});
  const [workflowRunHistoryErrorByDecision, setWorkflowRunHistoryErrorByDecision] = useState<Record<string, string | null>>({});
  const [workflowRunHistoryLimitByDecision, setWorkflowRunHistoryLimitByDecision] = useState<Record<string, number>>({});
  const [refreshVersion, setRefreshVersion] = useState(0);
  const workflowRunHistoryByDecisionRef = useRef(workflowRunHistoryByDecision);
  const workflowRunHistoryLoadingByDecisionRef = useRef(workflowRunHistoryLoadingByDecision);
  const workflowRunHistoryLimitByDecisionRef = useRef(workflowRunHistoryLimitByDecision);

  useEffect(() => {
    workflowRunHistoryByDecisionRef.current = workflowRunHistoryByDecision;
  }, [workflowRunHistoryByDecision]);

  useEffect(() => {
    workflowRunHistoryLoadingByDecisionRef.current = workflowRunHistoryLoadingByDecision;
  }, [workflowRunHistoryLoadingByDecision]);

  useEffect(() => {
    workflowRunHistoryLimitByDecisionRef.current = workflowRunHistoryLimitByDecision;
  }, [workflowRunHistoryLimitByDecision]);

  const invalidateDecisionRunHistory = useCallback((decisionId: string) => {
    const normalizedDecisionId = decisionId.trim();
    if (normalizedDecisionId.length === 0) {
      return;
    }

    setWorkflowRunHistoryByDecision((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, normalizedDecisionId)) {
        return prev;
      }
      const next = { ...prev };
      delete next[normalizedDecisionId];
      return next;
    });
    setWorkflowRunHistoryLoadingByDecision((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, normalizedDecisionId)) {
        return prev;
      }
      const next = { ...prev };
      delete next[normalizedDecisionId];
      return next;
    });
    setWorkflowRunHistoryErrorByDecision((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, normalizedDecisionId)) {
        return prev;
      }
      const next = { ...prev };
      delete next[normalizedDecisionId];
      return next;
    });
    setWorkflowRunHistoryLimitByDecision((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, normalizedDecisionId)) {
        return prev;
      }
      const next = { ...prev };
      delete next[normalizedDecisionId];
      return next;
    });
    setRefreshVersion((value) => value + 1);
  }, []);

  const invalidateAllRunHistory = useCallback(() => {
    setWorkflowRunHistoryByDecision({});
    setWorkflowRunHistoryLoadingByDecision({});
    setWorkflowRunHistoryErrorByDecision({});
    setWorkflowRunHistoryLimitByDecision({});
    setRefreshVersion((value) => value + 1);
  }, []);

  const loadWorkflowRunHistoryForDecision = useCallback(
    async (decisionIdForHistory: string, limit: number, abortSignal?: AbortSignal): Promise<void> => {
      const normalizedLimit = Math.max(1, Math.min(100, Math.round(limit)));
      const storedLimit = workflowRunHistoryLimitByDecisionRef.current[decisionIdForHistory] ?? 0;

      if (
        storedLimit >= normalizedLimit &&
        Object.prototype.hasOwnProperty.call(workflowRunHistoryByDecisionRef.current, decisionIdForHistory)
      ) {
        return;
      }

      if (workflowRunHistoryLoadingByDecisionRef.current[decisionIdForHistory]) {
        return;
      }

      setWorkflowRunHistoryLoadingByDecision((prev) => ({ ...prev, [decisionIdForHistory]: true }));
      setWorkflowRunHistoryErrorByDecision((prev) => ({ ...prev, [decisionIdForHistory]: null }));

      try {
        const response = await fetch(`/api/workflow/runs?decisionId=${encodeURIComponent(decisionIdForHistory)}&limit=${normalizedLimit}`, {
          cache: "no-store",
          signal: abortSignal,
        });

        if (response.status === 304) {
          setWorkflowRunHistoryByDecision((prev) => ({
            ...prev,
            [decisionIdForHistory]: prev[decisionIdForHistory] ?? [],
          }));
          setWorkflowRunHistoryLimitByDecision((prev) => ({
            ...prev,
            [decisionIdForHistory]: Math.max(prev[decisionIdForHistory] ?? 0, normalizedLimit),
          }));
          return;
        }

        const json = (await response.json()) as WorkflowRunHistoryResponse;
        if (!response.ok) {
          throw new Error(json.details || json.error || "Failed to load workflow run history.");
        }

        const runs = Array.isArray(json.runs) ? json.runs : [];
        const normalizedRuns = runs.map((run) => {
          const runStateRecord = asRecord(run.state_preview);
          const runState =
            runStateRecord
              ? {
                ...runStateRecord,
                run_id: run.id,
                run_created_at: run.created_at,
              }
              : run.state_preview;

          return {
            id: run.id,
            createdAt: run.created_at,
            state: runState,
          } satisfies WorkflowRunStateEntry;
        });

        setWorkflowRunHistoryByDecision((prev) => ({
          ...prev,
          [decisionIdForHistory]: normalizedRuns,
        }));
        setWorkflowRunHistoryLimitByDecision((prev) => ({
          ...prev,
          [decisionIdForHistory]: Math.max(prev[decisionIdForHistory] ?? 0, normalizedLimit),
        }));
      } catch (historyError) {
        const errorName = (historyError as any)?.name;
        const errorMessage = (historyError as any)?.message?.toLowerCase() || "";
        if (errorName === "AbortError" || errorMessage.includes("aborted")) {
          return;
        }

        const message = historyError instanceof Error ? historyError.message : String(historyError);
        setWorkflowRunHistoryByDecision((prev) => ({ ...prev, [decisionIdForHistory]: [] }));
        setWorkflowRunHistoryErrorByDecision((prev) => ({ ...prev, [decisionIdForHistory]: message }));
      } finally {
        setWorkflowRunHistoryLoadingByDecision((prev) => ({ ...prev, [decisionIdForHistory]: false }));
      }
    },
    [],
  );

  useEffect(() => {
    if (!selectedStrategyId) {
      return;
    }

    const decisionIdForHistory = selectedStrategyId;
    const abortController = new AbortController();
    loadWorkflowRunHistoryForDecision(decisionIdForHistory, 20, abortController.signal);

    return () => {
      abortController.abort();
    };
  }, [loadWorkflowRunHistoryForDecision, refreshVersion, selectedStrategyId]);

  useEffect(() => {
    if (preloadDecisionIds.length === 0) {
      return;
    }

    const preloadQueue = [...new Set(preloadDecisionIds.map((entry) => entry.trim()).filter((entry) => entry.length > 0))]
      .slice(0, 120);
    if (preloadQueue.length === 0) {
      return;
    }

    const abortController = new AbortController();
    let cancelled = false;

    async function warmHistory(): Promise<void> {
      for (const decisionId of preloadQueue) {
        if (cancelled) {
          return;
        }
        // Warm card-level summaries with minimal payload.
        await loadWorkflowRunHistoryForDecision(decisionId, preloadLimit, abortController.signal);
      }
    }

    void warmHistory();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [loadWorkflowRunHistoryForDecision, preloadDecisionIds, preloadLimit, refreshVersion]);

  return {
    workflowRunHistoryByDecision,
    workflowRunHistoryLoadingByDecision,
    workflowRunHistoryErrorByDecision,
    invalidateDecisionRunHistory,
    invalidateAllRunHistory,
  };
}
