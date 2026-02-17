import { useCallback } from "react";

import type { DecisionStrategy, WorkflowRunStateEntry } from "../types";

interface UseBoardroomActionsParams {
  selectedStrategy: DecisionStrategy | null;
  selectedStrategyRunHistory: WorkflowRunStateEntry[];
  initializeCreateStrategyForm: () => void;
  resetStrategyDetailsLoading: () => void;
  openCreateStage: () => void;
  resetCreatePanelState: () => void;
  openDashboardList: () => void;
  openWorkspaceEditor: () => void;
  initializeWorkflowSession: (strategy: DecisionStrategy) => void;
  showWorkflowRunHistory: (states: unknown[]) => void;
  openWorkspacePreview: () => void;
}

interface UseBoardroomActionsResult {
  openCreateStrategyForm: () => void;
  cancelCreateStrategy: () => void;
  enterWorkflowFromStrategy: () => void;
  viewSelectedStrategyRunHistory: () => void;
}

export function useBoardroomActions({
  selectedStrategy,
  selectedStrategyRunHistory,
  initializeCreateStrategyForm,
  resetStrategyDetailsLoading,
  openCreateStage,
  resetCreatePanelState,
  openDashboardList,
  openWorkspaceEditor,
  initializeWorkflowSession,
  showWorkflowRunHistory,
  openWorkspacePreview,
}: UseBoardroomActionsParams): UseBoardroomActionsResult {
  const openCreateStrategyForm = useCallback((): void => {
    initializeCreateStrategyForm();
    resetStrategyDetailsLoading();
    openCreateStage();
  }, [initializeCreateStrategyForm, openCreateStage, resetStrategyDetailsLoading]);

  const cancelCreateStrategy = useCallback((): void => {
    resetCreatePanelState();
    resetStrategyDetailsLoading();
    openDashboardList();
  }, [openDashboardList, resetCreatePanelState, resetStrategyDetailsLoading]);

  const enterWorkflowFromStrategy = useCallback((): void => {
    if (!selectedStrategy) {
      return;
    }
    openWorkspaceEditor();
    initializeWorkflowSession(selectedStrategy);
  }, [initializeWorkflowSession, openWorkspaceEditor, selectedStrategy]);

  const viewSelectedStrategyRunHistory = useCallback((): void => {
    if (!selectedStrategy) {
      return;
    }

    const historyStates = selectedStrategyRunHistory.map((entry) => entry.state).filter((state): state is unknown => Boolean(state));
    if (historyStates.length === 0) {
      return;
    }

    showWorkflowRunHistory(historyStates);
    openWorkspacePreview();
  }, [openWorkspacePreview, selectedStrategy, selectedStrategyRunHistory, showWorkflowRunHistory]);

  return {
    openCreateStrategyForm,
    cancelCreateStrategy,
    enterWorkflowFromStrategy,
    viewSelectedStrategyRunHistory,
  };
}
