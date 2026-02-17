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

export function useWorkflowRunHistory(selectedStrategyId: string | null): UseWorkflowRunHistoryResult {
  const [workflowRunHistoryByDecision, setWorkflowRunHistoryByDecision] = useState<Record<string, WorkflowRunStateEntry[]>>({});
  const [workflowRunHistoryLoadingByDecision, setWorkflowRunHistoryLoadingByDecision] = useState<Record<string, boolean>>({});
  const [workflowRunHistoryErrorByDecision, setWorkflowRunHistoryErrorByDecision] = useState<Record<string, string | null>>({});
  const [refreshVersion, setRefreshVersion] = useState(0);
  const workflowRunHistoryByDecisionRef = useRef(workflowRunHistoryByDecision);
  const workflowRunHistoryLoadingByDecisionRef = useRef(workflowRunHistoryLoadingByDecision);

  useEffect(() => {
    workflowRunHistoryByDecisionRef.current = workflowRunHistoryByDecision;
  }, [workflowRunHistoryByDecision]);

  useEffect(() => {
    workflowRunHistoryLoadingByDecisionRef.current = workflowRunHistoryLoadingByDecision;
  }, [workflowRunHistoryLoadingByDecision]);

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
    setRefreshVersion((value) => value + 1);
  }, []);

  const invalidateAllRunHistory = useCallback(() => {
    setWorkflowRunHistoryByDecision({});
    setWorkflowRunHistoryLoadingByDecision({});
    setWorkflowRunHistoryErrorByDecision({});
    setRefreshVersion((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!selectedStrategyId) {
      return;
    }

    const decisionIdForHistory = selectedStrategyId;

    if (Object.prototype.hasOwnProperty.call(workflowRunHistoryByDecisionRef.current, decisionIdForHistory)) {
      return;
    }

    if (workflowRunHistoryLoadingByDecisionRef.current[decisionIdForHistory]) {
      return;
    }

    const abortController = new AbortController();
    let cancelled = false;

    async function loadWorkflowRunHistory(): Promise<void> {
      setWorkflowRunHistoryLoadingByDecision((prev) => ({ ...prev, [decisionIdForHistory]: true }));
      setWorkflowRunHistoryErrorByDecision((prev) => ({ ...prev, [decisionIdForHistory]: null }));

      try {
        const response = await fetch(`/api/workflow/runs?decisionId=${encodeURIComponent(decisionIdForHistory)}&limit=20`, {
          cache: "no-store",
          signal: abortController.signal,
        });

        if (response.status === 304) {
          if (!cancelled) {
            setWorkflowRunHistoryByDecision((prev) => ({
              ...prev,
              [decisionIdForHistory]: prev[decisionIdForHistory] ?? [],
            }));
          }
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

        if (cancelled) {
          return;
        }

        setWorkflowRunHistoryByDecision((prev) => ({
          ...prev,
          [decisionIdForHistory]: normalizedRuns,
        }));
      } catch (historyError) {
        if (historyError instanceof DOMException && historyError.name === "AbortError") {
          return;
        }

        if (cancelled) {
          return;
        }

        const message = historyError instanceof Error ? historyError.message : String(historyError);
        setWorkflowRunHistoryByDecision((prev) => ({ ...prev, [decisionIdForHistory]: [] }));
        setWorkflowRunHistoryErrorByDecision((prev) => ({ ...prev, [decisionIdForHistory]: message }));
      } finally {
        setWorkflowRunHistoryLoadingByDecision((prev) => ({ ...prev, [decisionIdForHistory]: false }));
      }
    }

    loadWorkflowRunHistory();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [refreshVersion, selectedStrategyId]);

  return {
    workflowRunHistoryByDecision,
    workflowRunHistoryLoadingByDecision,
    workflowRunHistoryErrorByDecision,
    invalidateDecisionRunHistory,
    invalidateAllRunHistory,
  };
}
