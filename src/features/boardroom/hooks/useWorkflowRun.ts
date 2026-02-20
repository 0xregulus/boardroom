import { useEffect, useMemo, useState } from "react";

import type { AgentConfig } from "../../../config/agent_config";
import type { ResearchProvider } from "../../../research/providers";
import type { AppStage, ApiResult, DecisionStrategy, NodeStatus, WorkflowNode, WorkflowTask } from "../types";
import { buildInitialNodes, buildInteractionTasks, buildReviewTasks, sleep } from "../utils";
import { useWorkflowStream, type WorkflowStreamPayload, type WorkflowStreamTraceEvent } from "./useWorkflowStream";

interface UseWorkflowRunParams {
  appStage: AppStage;
  selectedStrategy: DecisionStrategy | null;
  reviewRoleLabels: string[];
  reviewSummary: string;
  agentConfigs: AgentConfig[];
  researchProvider: ResearchProvider;
  researchProviderConfigured: boolean;
  onRunSuccess: (decisionId: string | null) => void;
}

interface UseWorkflowRunResult {
  nodes: WorkflowNode[];
  selectedNodeId: string | null;
  expandedNodeId: string | null;
  decisionId: string;
  includeExternalResearch: boolean;
  includeRedTeamPersonas: boolean;
  interactionRounds: number;
  previewIndex: number;
  isRunning: boolean;
  error: string | null;
  result: ApiResult | null;
  logLines: string[];
  runLabel: string;
  liveInfluence: number[];
  thinkingAgents: boolean[];
  setDecisionId: (value: string) => void;
  setIncludeExternalResearch: (value: boolean) => void;
  setIncludeRedTeamPersonas: (value: boolean) => void;
  setInteractionRounds: (value: number) => void;
  setPreviewIndex: (index: number) => void;
  handleNodeClick: (node: WorkflowNode) => void;
  handleRun: () => Promise<void>;
  initializeWorkflowSession: (strategy: DecisionStrategy) => void;
  showWorkflowRunHistory: (states: unknown[]) => void;
}

export function useWorkflowRun({
  appStage,
  selectedStrategy,
  reviewRoleLabels,
  reviewSummary,
  agentConfigs,
  researchProvider,
  researchProviderConfigured,
  onRunSuccess,
}: UseWorkflowRunParams): UseWorkflowRunResult {
  const [nodes, setNodes] = useState<WorkflowNode[]>(() => buildInitialNodes(null));
  const [decisionId, setDecisionId] = useState("");
  const [includeExternalResearch, setIncludeExternalResearch] = useState(false);
  const [includeRedTeamPersonas, setIncludeRedTeamPersonas] = useState(false);
  const [interactionRounds, setInteractionRounds] = useState(1);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);

  const {
    liveInfluence,
    thinkingAgents,
    isRunning: isStreamRunning,
    error: streamError,
    result: streamResult,
    runWorkflow,
  } = useWorkflowStream();

  const reviewNode = useMemo(() => nodes.find((node) => node.id === "3") ?? null, [nodes]);
  const interactionNode = useMemo(() => nodes.find((node) => node.id === "4") ?? null, [nodes]);

  const runLabel = useMemo(() => {
    if (isRunning || isStreamRunning) {
      return "Running Pipeline...";
    }
    return "Execute Pipeline";
  }, [isRunning, isStreamRunning]);

  const effectiveReviewRoleLabels = useMemo(() => {
    const labels = reviewRoleLabels
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    const normalized = new Set(labels.map((entry) => entry.toLowerCase()));
    if (includeRedTeamPersonas) {
      if (!normalized.has("pre-mortem")) {
        labels.push("Pre-Mortem");
      }
      if (!normalized.has("resource competitor")) {
        labels.push("Resource Competitor");
      }
      if (!normalized.has("risk agent")) {
        labels.push("Risk Agent");
      }
      if (!normalized.has("devil's advocate")) {
        labels.push("Devil's Advocate");
      }
    }
    return labels;
  }, [reviewRoleLabels, includeRedTeamPersonas]);

  const effectiveReviewSummary = useMemo(
    () => (effectiveReviewRoleLabels.length > 0 ? effectiveReviewRoleLabels.join(", ") : reviewSummary),
    [effectiveReviewRoleLabels, reviewSummary],
  );

  useEffect(() => {
    setPreviewIndex(0);
  }, [result]);

  useEffect(() => {
    if (!researchProviderConfigured && includeExternalResearch) {
      setIncludeExternalResearch(false);
    }
  }, [includeExternalResearch, researchProviderConfigured]);

  useEffect(() => {
    setNodes((prev) =>
      prev.map((node) =>
        node.id === "1"
          ? {
            ...node,
            subtitle: selectedStrategy?.name ?? "No Strategy Selected",
          }
          : node,
      ),
    );
  }, [selectedStrategy]);

  useEffect(() => {
    const nextTasks = buildInteractionTasks(interactionRounds);
    const subtitle =
      nextTasks.length > 0 ? `${nextTasks.length} rebuttal round${nextTasks.length === 1 ? "" : "s"}` : "Rebuttal disabled";

    setNodes((prev) =>
      prev.map((node) => {
        if (node.id !== "4") {
          return node;
        }

        const mergedTasks = nextTasks.map((task) => {
          const existingTask = node.tasks?.find((candidate) => candidate.id === task.id);
          return existingTask ? { ...task, status: existingTask.status } : task;
        });

        return {
          ...node,
          subtitle,
          tasks: mergedTasks,
        };
      }),
    );
  }, [interactionRounds]);

  useEffect(() => {
    const nextTasks = buildReviewTasks(effectiveReviewRoleLabels);

    setNodes((prev) =>
      prev.map((node) => {
        if (node.id !== "3") {
          return node;
        }

        const mergedTasks = nextTasks.map((task) => {
          const existingTask = node.tasks?.find((candidate) => candidate.id === task.id || candidate.title === task.title);
          return existingTask ? { ...task, status: existingTask.status } : task;
        });

        return {
          ...node,
          subtitle: effectiveReviewSummary,
          tasks: mergedTasks,
        };
      }),
    );
  }, [effectiveReviewRoleLabels, effectiveReviewSummary]);

  useEffect(() => {
    if ((!isRunning && !isStreamRunning) || !reviewNode || (reviewNode.status !== "RUNNING" && reviewNode.status !== "IDLE") || (reviewNode.tasks?.length ?? 0) <= 1) {
      return;
    }
    // Only auto-expand if we are actually in review phase
    if (reviewNode.status === "RUNNING") {
      setExpandedNodeId("3");
    }
  }, [isRunning, isStreamRunning, reviewNode]);

  useEffect(() => {
    if ((!isRunning && !isStreamRunning) || !interactionNode || (interactionNode.status !== "RUNNING" && interactionNode.status !== "IDLE") || (interactionNode.tasks?.length ?? 0) <= 1) {
      return;
    }
    if (interactionNode.status === "RUNNING") {
      setExpandedNodeId("4");
    }
  }, [isRunning, isStreamRunning, interactionNode]);

  function addLog(message: string): void {
    const timestamp = new Date().toLocaleTimeString([], { hour12: false });
    setLogLines((prev) => [...prev, `${timestamp}  ${message}`]);
  }

  function updateNodeStatus(id: string, status: NodeStatus): void {
    setNodes((prev) => prev.map((node) => (node.id === id ? { ...node, status } : node)));
  }

  function updateReviewTasks(updater: (task: WorkflowTask) => WorkflowTask): void {
    setNodes((prev) =>
      prev.map((node) =>
        node.id === "3"
          ? {
            ...node,
            tasks: (node.tasks ?? []).map(updater),
          }
          : node,
      ),
    );
  }

  function handleNodeClick(node: WorkflowNode): void {
    setSelectedNodeId(node.id);
    if ((node.tasks?.length ?? 0) <= 1) {
      setExpandedNodeId(null);
      return;
    }
    setExpandedNodeId((prev) => (prev === node.id ? null : node.id));
  }

  function initializeWorkflowSession(strategy: DecisionStrategy): void {
    const timestamp = new Date().toLocaleTimeString([], { hour12: false });
    setSelectedNodeId("1");
    setExpandedNodeId(null);
    setNodes(buildInitialNodes(strategy.name, effectiveReviewRoleLabels, interactionRounds));
    setLogLines([`${timestamp}  Context loaded: ${strategy.name} (${strategy.id})`]);
  }

  function showWorkflowRunHistory(states: unknown[]): void {
    if (states.length === 0) {
      return;
    }

    setError(null);
    setResult({
      mode: "all_proposed",
      count: states.length,
      results: states,
    });
    setPreviewIndex(0);
  }

  async function runStep(nodeId: string, message: string, duration = 500): Promise<void> {
    updateNodeStatus(nodeId, "RUNNING");
    addLog(message);
    await sleep(duration);
    updateNodeStatus(nodeId, "COMPLETED");
  }

  async function handleRun(): Promise<void> {
    if (isRunning || isStreamRunning || appStage !== "workspace") {
      return;
    }

    setIsRunning(true);
    setError(null);
    setResult(null);
    setLogLines([]);
    setNodes(buildInitialNodes(selectedStrategy?.name ?? null, effectiveReviewRoleLabels, interactionRounds));
    setSelectedNodeId("1");
    setExpandedNodeId(null);

    const selectedDecisionId = decisionId.trim().length > 0 ? decisionId.trim() : selectedStrategy?.id ?? "";
    const externalResearchEnabledForRun = researchProviderConfigured && includeExternalResearch;
    const payload: WorkflowStreamPayload = {
      agentConfigs,
      includeExternalResearch: externalResearchEnabledForRun,
      researchProvider,
      includeRedTeamPersonas,
      includeSensitive: true,
      interactionRounds,
    };
    if (selectedDecisionId.length > 0) {
      payload.decisionId = selectedDecisionId;
    }

    const inputSummary =
      selectedStrategy && selectedDecisionId.length > 0
        ? `Strategy selected: ${selectedStrategy.name} (${selectedDecisionId})`
        : selectedDecisionId.length > 0
          ? `Decision selected: ${selectedDecisionId}`
        : "No decision ID provided, running all Proposed decisions";

    const handleExecutionTrace = (entry: WorkflowStreamTraceEvent): void => {
      const normalizedMessage = entry.message.trim();
      if (normalizedMessage.length === 0) {
        return;
      }

      const agentPrefix = entry.agentId ? `${entry.agentId}: ` : "";
      addLog(`${entry.tag} ${agentPrefix}${normalizedMessage}`);
    };

    const normalizeTaskKey = (value: string): string =>
      value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

    const reviewTaskIds = buildReviewTasks(effectiveReviewRoleLabels).map((task) => task.id);
    const reviewTaskCount = Math.max(1, reviewTaskIds.length);
    const completedFirstPass = new Set<string>();
    let rebuttalStarted = false;
    let rebuttalAgentCompletions = 0;
    const runtimeAliases: Record<string, string[]> = {
      "risk-simulation": ["risk-agent"],
      "devils-advocate": ["devil-s-advocate"],
    };

    const resolveTaskIdsFromStream = (agentId: string | undefined, streamIndex: number): string[] => {
      const candidates = new Set<string>();
      if (typeof streamIndex === "number" && reviewTaskIds[streamIndex]) {
        candidates.add(reviewTaskIds[streamIndex]);
      }
      if (agentId) {
        const normalized = normalizeTaskKey(agentId);
        if (normalized.length > 0) {
          candidates.add(normalized);
          for (const alias of runtimeAliases[normalized] ?? []) {
            candidates.add(alias);
          }
        }
      }
      return [...candidates];
    };

    try {
      await runStep(
        "1",
        `${inputSummary} | External research: ${externalResearchEnabledForRun ? `${researchProvider}` : "Off"} | Red team: ${includeRedTeamPersonas ? "On" : "Off"} | Rebuttal rounds: ${interactionRounds}`,
        350,
      );

      // Update UI nodes to show progress while we stream
      updateNodeStatus("2", "RUNNING");
      addLog("Drafting strategic decision document");

      // Start the actual streaming workflow
      const streamPromise = runWorkflow(payload, {
        onTrace: handleExecutionTrace,
        onAgentThinking: ({ index, agentId }) => {
          const targetIds = resolveTaskIdsFromStream(agentId, index);
          if (targetIds.length === 0) {
            return;
          }
          updateReviewTasks((task) =>
            targetIds.includes(normalizeTaskKey(task.id)) || targetIds.includes(normalizeTaskKey(task.title))
              ? { ...task, status: "RUNNING" }
              : task,
          );
        },
        onAgentResult: ({ index, agentId }) => {
          const targetIds = resolveTaskIdsFromStream(agentId, index);
          if (targetIds.length === 0) {
            return;
          }

          updateReviewTasks((task) =>
            targetIds.includes(normalizeTaskKey(task.id)) || targetIds.includes(normalizeTaskKey(task.title))
              ? { ...task, status: "COMPLETED" }
              : task,
          );

          const firstMatch = targetIds[0];
          if (!rebuttalStarted && firstMatch) {
            completedFirstPass.add(firstMatch);
            if (completedFirstPass.size >= reviewTaskCount && interactionRounds > 0) {
              rebuttalStarted = true;
              updateNodeStatus("3", "COMPLETED");
              updateNodeStatus("4", "RUNNING");
              setExpandedNodeId("4");
              addLog(`Running ${interactionRounds} cross-agent rebuttal round${interactionRounds === 1 ? "" : "s"}`);
            }
          } else if (rebuttalStarted) {
            rebuttalAgentCompletions += 1;
            const round = Math.min(interactionRounds, Math.max(1, Math.ceil(rebuttalAgentCompletions / reviewTaskCount)));
            addLog(`Round ${round} rebuttal in progress`);
          }
        },
      });

      // We still simulate some UI transitions for the high-level steps since the SSE 
      // primarily reports on individual agents in 3 and 4.
      await sleep(1200);
      updateNodeStatus("2", "COMPLETED");

      updateNodeStatus("3", "RUNNING");
      addLog("Running parallel executive reviews");
      setExpandedNodeId("3");

      // Monitor stream results to decide when to finish steps
      // Note: In a production app, we'd use the SSE events to toggle these statuses.
      // For now, we wait for the stream to provide the final result.
      await streamPromise;

      // Post-process statuses after stream ends
      updateNodeStatus("3", "COMPLETED");
      updateNodeStatus("4", "COMPLETED");
      updateNodeStatus("5", "COMPLETED");
      updateNodeStatus("6", "COMPLETED");
      updateNodeStatus("7", "COMPLETED");

      if (streamError) {
        throw new Error(streamError);
      }

      if (streamResult) {
        setResult(streamResult);
        addLog("Pipeline execution complete");
        onRunSuccess(selectedDecisionId.length > 0 ? selectedDecisionId : null);
      }
    } catch (runError) {
      const message = runError instanceof Error ? runError.message : String(runError);
      setError(message);
      updateNodeStatus("7", "FAILED");
      addLog(`Pipeline failed: ${message}`);
    } finally {
      setIsRunning(false);
    }
  }

  return {
    nodes,
    selectedNodeId,
    expandedNodeId,
    decisionId,
    includeExternalResearch,
    includeRedTeamPersonas,
    interactionRounds,
    previewIndex,
    isRunning: isRunning || isStreamRunning,
    error: error || streamError,
    result: result || streamResult,
    logLines,
    runLabel,
    liveInfluence,
    thinkingAgents,
    setDecisionId,
    setIncludeExternalResearch,
    setIncludeRedTeamPersonas,
    setInteractionRounds,
    setPreviewIndex,
    handleNodeClick,
    handleRun,
    initializeWorkflowSession,
    showWorkflowRunHistory,
  };
}
