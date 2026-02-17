import { useEffect, useMemo, useState } from "react";

import type { AgentConfig } from "../../../config/agent_config";
import type { AppStage, ApiResult, DecisionStrategy, NodeStatus, WorkflowNode, WorkflowTask } from "../types";
import { buildInitialNodes, buildInteractionTasks, buildReviewTasks, sleep } from "../utils";

interface UseWorkflowRunParams {
  appStage: AppStage;
  selectedStrategy: DecisionStrategy | null;
  reviewRoleLabels: string[];
  reviewSummary: string;
  agentConfigs: AgentConfig[];
  tavilyConfigured: boolean;
  onRunSuccess: (decisionId: string | null) => void;
}

interface UseWorkflowRunResult {
  nodes: WorkflowNode[];
  selectedNodeId: string | null;
  expandedNodeId: string | null;
  decisionId: string;
  includeExternalResearch: boolean;
  interactionRounds: number;
  previewIndex: number;
  isRunning: boolean;
  error: string | null;
  result: ApiResult | null;
  logLines: string[];
  runLabel: string;
  setDecisionId: (value: string) => void;
  setIncludeExternalResearch: (value: boolean) => void;
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
  tavilyConfigured,
  onRunSuccess,
}: UseWorkflowRunParams): UseWorkflowRunResult {
  const [nodes, setNodes] = useState<WorkflowNode[]>(() => buildInitialNodes(null));
  const [decisionId, setDecisionId] = useState("");
  const [includeExternalResearch, setIncludeExternalResearch] = useState(false);
  const [interactionRounds, setInteractionRounds] = useState(1);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);

  const reviewNode = useMemo(() => nodes.find((node) => node.id === "3") ?? null, [nodes]);
  const interactionNode = useMemo(() => nodes.find((node) => node.id === "4") ?? null, [nodes]);

  const runLabel = useMemo(() => {
    if (isRunning) {
      return "Running Pipeline...";
    }
    return "Execute Pipeline";
  }, [isRunning]);

  useEffect(() => {
    setPreviewIndex(0);
  }, [result]);

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
    const nextTasks = buildReviewTasks(reviewRoleLabels);

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
          subtitle: reviewSummary,
          tasks: mergedTasks,
        };
      }),
    );
  }, [reviewRoleLabels, reviewSummary]);

  useEffect(() => {
    if (!isRunning || !reviewNode || reviewNode.status !== "RUNNING" || (reviewNode.tasks?.length ?? 0) <= 1) {
      return;
    }
    setExpandedNodeId("3");
  }, [isRunning, reviewNode]);

  useEffect(() => {
    if (!isRunning || !interactionNode || interactionNode.status !== "RUNNING" || (interactionNode.tasks?.length ?? 0) <= 1) {
      return;
    }
    setExpandedNodeId("4");
  }, [isRunning, interactionNode]);

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

  function updateInteractionTasks(updater: (task: WorkflowTask) => WorkflowTask): void {
    setNodes((prev) =>
      prev.map((node) =>
        node.id === "4"
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
    setNodes(buildInitialNodes(strategy.name, reviewRoleLabels, interactionRounds));
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

  async function runParallelReviewStep(message: string): Promise<void> {
    const reviewTasks = buildReviewTasks(reviewRoleLabels);

    updateNodeStatus("3", "RUNNING");
    setExpandedNodeId("3");
    addLog(message);
    setNodes((prev) =>
      prev.map((node) =>
        node.id === "3"
          ? {
            ...node,
            subtitle: reviewSummary,
            tasks: reviewTasks.map((task) => ({ ...task, status: "RUNNING" })),
          }
          : node,
      ),
    );

    if (reviewTasks.length === 0) {
      await sleep(250);
      updateNodeStatus("3", "COMPLETED");
      return;
    }

    await Promise.all(
      reviewTasks.map(async (task) => {
        const latencyMs = 420 + Math.floor(Math.random() * 980);
        await sleep(latencyMs);
        updateReviewTasks((candidate) =>
          candidate.id === task.id ? { ...candidate, status: "COMPLETED" } : candidate,
        );
        addLog(`${task.title} review completed (${latencyMs}ms)`);
      }),
    );

    updateNodeStatus("3", "COMPLETED");
  }

  async function runInteractionRoundStep(): Promise<void> {
    const interactionTasks = buildInteractionTasks(interactionRounds);
    updateNodeStatus("4", "RUNNING");

    if (interactionTasks.length === 0) {
      addLog("Skipping cross-agent rebuttal rounds (disabled)");
      await sleep(250);
      updateNodeStatus("4", "COMPLETED");
      return;
    }

    setNodes((prev) =>
      prev.map((node) =>
        node.id === "4"
          ? {
            ...node,
            subtitle: `${interactionTasks.length} rebuttal round${interactionTasks.length === 1 ? "" : "s"}`,
            tasks: interactionTasks.map((task) => ({ ...task, status: "RUNNING" })),
          }
          : node,
      ),
    );
    addLog(`Running ${interactionTasks.length} cross-agent rebuttal round${interactionTasks.length === 1 ? "" : "s"}`);

    for (const task of interactionTasks) {
      const latencyMs = 320 + Math.floor(Math.random() * 620);
      await sleep(latencyMs);
      updateInteractionTasks((candidate) =>
        candidate.id === task.id ? { ...candidate, status: "COMPLETED" } : candidate,
      );
      addLog(`${task.title} rebuttal completed (${latencyMs}ms)`);
    }

    updateNodeStatus("4", "COMPLETED");
  }

  async function handleRun(): Promise<void> {
    if (isRunning || appStage !== "workspace") {
      return;
    }

    setIsRunning(true);
    setError(null);
    setResult(null);
    setLogLines([]);
    setNodes(buildInitialNodes(selectedStrategy?.name ?? null, reviewRoleLabels, interactionRounds));
    setSelectedNodeId("1");
    setExpandedNodeId(null);

    const selectedDecisionId = decisionId.trim().length > 0 ? decisionId.trim() : selectedStrategy?.id ?? "";
    const externalResearchEnabledForRun = tavilyConfigured && includeExternalResearch;
    const payload: {
      decisionId?: string;
      agentConfigs: AgentConfig[];
      includeExternalResearch: boolean;
      includeSensitive: boolean;
      interactionRounds: number;
    } = {
      agentConfigs,
      includeExternalResearch: externalResearchEnabledForRun,
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

    try {
      await runStep(
        "1",
        `${inputSummary} | External research: ${externalResearchEnabledForRun ? "On" : "Off"} | Rebuttal rounds: ${interactionRounds}`,
        350,
      );
      await runStep("2", "Drafting strategic decision document", 450);
      await runParallelReviewStep("Running parallel executive reviews");
      await runInteractionRoundStep();
      await runStep("5", "Synthesizing reviews and computing DQS", 500);
      await runStep("6", "Generating PRD package", 500);

      updateNodeStatus("7", "RUNNING");
      addLog("Syncing artifacts to Strategic Decision Log");

      const response = await fetch("/api/workflow/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const json = (await response.json()) as ApiResult & { error?: string; details?: string };

      if (!response.ok) {
        throw new Error(json.details || json.error || "Workflow run failed.");
      }

      setResult(json);
      updateNodeStatus("7", "COMPLETED");
      addLog("Pipeline execution complete");
      onRunSuccess(selectedDecisionId.length > 0 ? selectedDecisionId : null);
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
    interactionRounds,
    previewIndex,
    isRunning,
    error,
    result,
    logLines,
    runLabel,
    setDecisionId,
    setIncludeExternalResearch,
    setInteractionRounds,
    setPreviewIndex,
    handleNodeClick,
    handleRun,
    initializeWorkflowSession,
    showWorkflowRunHistory,
  };
}
