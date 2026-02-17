import { useCallback } from "react";

import type { DecisionStrategy } from "../types";
import { useCreateDraft } from "./useCreateDraft";
import { useSelectedStrategy } from "./useSelectedStrategy";
import { useStrategies } from "./useStrategies";
import { useWorkflowRunHistory } from "./useWorkflowRunHistory";

export function useBoardroomStrategyController() {
  const { strategies, isLoading: isLoadingStrategies, error: strategyLoadError, setStrategies } = useStrategies();
  const createDraftState = useCreateDraft();
  const { setIsCoreCollapsed, setIsCapitalCollapsed, setIsRiskCollapsed } = createDraftState;
  const {
    selectedStrategyId,
    setSelectedStrategyId,
    selectedStrategy,
    handleStrategySelect: selectStrategy,
  } = useSelectedStrategy({
    strategies,
  });
  const {
    workflowRunHistoryByDecision,
    workflowRunHistoryLoadingByDecision,
    workflowRunHistoryErrorByDecision,
    invalidateDecisionRunHistory,
    invalidateAllRunHistory,
  } = useWorkflowRunHistory(selectedStrategyId);

  const prependStrategyAndSelect = useCallback((strategy: DecisionStrategy): void => {
    setStrategies((prev) => [strategy, ...prev]);
    setSelectedStrategyId(strategy.id);
  }, [setSelectedStrategyId, setStrategies]);

  const upsertStrategy = useCallback((strategy: DecisionStrategy): void => {
    setStrategies((prev) => prev.map((entry) => (entry.id === strategy.id ? { ...entry, ...strategy } : entry)));
  }, [setStrategies]);

  const toggleCore = useCallback((): void => {
    setIsCoreCollapsed((prev) => !prev);
  }, [setIsCoreCollapsed]);
  const toggleCapital = useCallback((): void => {
    setIsCapitalCollapsed((prev) => !prev);
  }, [setIsCapitalCollapsed]);
  const toggleRisk = useCallback((): void => {
    setIsRiskCollapsed((prev) => !prev);
  }, [setIsRiskCollapsed]);

  return {
    strategies,
    isLoadingStrategies,
    strategyLoadError,
    selectedStrategyId,
    selectedStrategy,
    selectStrategy,
    prependStrategyAndSelect,
    upsertStrategy,
    workflowRunHistoryByDecision,
    workflowRunHistoryLoadingByDecision,
    workflowRunHistoryErrorByDecision,
    invalidateDecisionRunHistory,
    invalidateAllRunHistory,
    toggleCore,
    toggleCapital,
    toggleRisk,
    ...createDraftState,
  };
}
