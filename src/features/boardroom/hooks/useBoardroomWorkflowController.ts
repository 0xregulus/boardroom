import { useCallback, useMemo } from "react";

import type { AgentConfig } from "../../../config/agent_config";
import type { AppStage, DecisionStrategy, WorkflowRunStateEntry } from "../types";
import { useWorkflowPreviewData } from "./useWorkflowPreviewData";
import { useWorkflowRun } from "./useWorkflowRun";

interface UseBoardroomWorkflowControllerParams {
  appStage: AppStage;
  selectedStrategy: DecisionStrategy | null;
  agentConfigs: AgentConfig[];
  tavilyConfigured: boolean;
  workflowRunHistoryByDecision: Record<string, WorkflowRunStateEntry[]>;
  workflowRunHistoryLoadingByDecision: Record<string, boolean>;
  workflowRunHistoryErrorByDecision: Record<string, string | null>;
  invalidateDecisionRunHistory: (decisionId: string) => void;
  invalidateAllRunHistory: () => void;
  onOpenWorkspacePreview: () => void;
}

export function useBoardroomWorkflowController({
  appStage,
  selectedStrategy,
  agentConfigs,
  tavilyConfigured,
  workflowRunHistoryByDecision,
  workflowRunHistoryLoadingByDecision,
  workflowRunHistoryErrorByDecision,
  invalidateDecisionRunHistory,
  invalidateAllRunHistory,
  onOpenWorkspacePreview,
}: UseBoardroomWorkflowControllerParams) {
  const reviewRoleLabels = useMemo(
    () => agentConfigs.map((config) => config.role.trim()).filter((role) => role.length > 0),
    [agentConfigs],
  );
  const reviewSummary = useMemo(
    () => (reviewRoleLabels.length > 0 ? reviewRoleLabels.join(", ") : "No reviewers configured"),
    [reviewRoleLabels],
  );
  const handleWorkflowRunSuccess = useCallback((executedDecisionId: string | null) => {
    if (executedDecisionId) {
      invalidateDecisionRunHistory(executedDecisionId);
    } else {
      invalidateAllRunHistory();
    }
    onOpenWorkspacePreview();
  }, [invalidateAllRunHistory, invalidateDecisionRunHistory, onOpenWorkspacePreview]);

  const workflowRunState = useWorkflowRun({
    appStage,
    selectedStrategy,
    reviewRoleLabels,
    reviewSummary,
    agentConfigs,
    tavilyConfigured,
    onRunSuccess: handleWorkflowRunSuccess,
  });
  const selectedNode = useMemo(
    () => workflowRunState.nodes.find((node) => node.id === workflowRunState.selectedNodeId) ?? null,
    [workflowRunState.nodes, workflowRunState.selectedNodeId],
  );
  const workflowPreviewState = useWorkflowPreviewData({
    result: workflowRunState.result,
    previewIndex: workflowRunState.previewIndex,
    selectedStrategy,
    workflowRunHistoryByDecision,
    workflowRunHistoryLoadingByDecision,
    workflowRunHistoryErrorByDecision,
  });
  const { handleRun } = workflowRunState;
  const handleRunClick = useCallback(() => {
    void handleRun();
  }, [handleRun]);

  return {
    ...workflowRunState,
    selectedNode,
    handleRunClick,
    ...workflowPreviewState,
  };
}
