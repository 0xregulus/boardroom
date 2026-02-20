import { useCallback, useEffect, useMemo, useState } from "react";

import type { ResearchProvider, ResearchProviderOption } from "../../../research/providers";
import type { DecisionStrategy } from "../types";
import { useAgentConfigs } from "./useAgentConfigs";
import { useBoardroomActions } from "./useBoardroomActions";
import { useBoardroomStageProps } from "./useBoardroomStageProps";
import { useBoardroomStrategyController } from "./useBoardroomStrategyController";
import { useBoardroomWorkflowController } from "./useBoardroomWorkflowController";
import { useStrategyCreation } from "./useStrategyCreation";
import { useStrategyDetailsLoader } from "./useStrategyDetailsLoader";
import { useWorkspaceNavigation } from "./useWorkspaceNavigation";

interface UseBoardroomHomeControllerParams {
  researchToolOptions: ResearchProviderOption[];
  defaultResearchProvider: ResearchProvider;
}

export function useBoardroomHomeController({
  researchToolOptions,
  defaultResearchProvider,
}: UseBoardroomHomeControllerParams) {
  const {
    appStage,
    workspaceView,
    activeTab,
    setActiveTab,
    openCreateStage,
    openDashboardList,
    openAgentConfig,
    openWorkspaceEditor,
    openWorkspacePreview,
    openHome,
  } = useWorkspaceNavigation();

  const {
    agentConfigs,
    selectedAgentId,
    setSelectedAgentId,
    syncStatus,
    syncMessage,
    isDirty,
    saveConfigs,
    resetConfigs,
    updateAgentField,
    updateProvider,
    addCustomReviewAgent,
    removeAgentById,
  } = useAgentConfigs();

  const {
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
    createDraft,
    isCreateReadOnly,
    isCoreCollapsed,
    isCapitalCollapsed,
    isRiskCollapsed,
    riskAdjustedValue,
    riskAdjustedRoi,
    weightedCapitalScore,
    riskScore,
    openCreateStrategyForm: initializeCreateStrategyForm,
    openStrategyDetails,
    replaceDraftFromStrategy,
    updateCreateTitle,
    updateCreateSection,
    updateCoreProperty,
    updateCapitalAllocation,
    updateRiskProperty,
    resetCreateDraft,
    resetCreatePanelState,
    toggleCore,
    toggleCapital,
    toggleRisk,
  } = useBoardroomStrategyController();

  const [researchProvider, setResearchProvider] = useState<ResearchProvider>(defaultResearchProvider);
  const configuredResearchProviders = useMemo(
    () => new Set(researchToolOptions.filter((option) => option.configured).map((option) => option.provider)),
    [researchToolOptions],
  );

  useEffect(() => {
    if (configuredResearchProviders.size === 0) {
      return;
    }

    if (!configuredResearchProviders.has(researchProvider)) {
      const fallback = researchToolOptions.find((option) => option.configured)?.provider;
      if (fallback) {
        setResearchProvider(fallback);
      }
    }
  }, [configuredResearchProviders, researchProvider, researchToolOptions]);

  const researchProviderConfigured = configuredResearchProviders.has(researchProvider);

  const {
    nodes,
    selectedNode,
    selectedNodeId,
    expandedNodeId,
    includeExternalResearch,
    includeRedTeamPersonas,
    interactionRounds,
    isRunning,
    error,
    result,
    logLines,
    runLabel,
    setDecisionId,
    setIncludeExternalResearch,
    setIncludeRedTeamPersonas,
    setInteractionRounds,
    setPreviewIndex,
    initializeWorkflowSession,
    showWorkflowRunHistory,
    handleRunClick,
    handleNodeClick,
    reportStates,
    clampedPreviewIndex,
    activeReport,
    selectedStrategyRunHistory,
    selectedStrategyRunHistoryCount,
    isSelectedStrategyRunHistoryLoading,
    selectedStrategyRunHistoryError,
    activeMetrics,
    activeGovernanceRows,
    activeReviews,
    activeRecommendation,
    activeRecommendationTone,
    blockedReviewCount,
    missingSectionCount,
    summaryLine,
  } = useBoardroomWorkflowController({
    appStage,
    selectedStrategy,
    agentConfigs,
    researchProvider,
    researchProviderConfigured,
    workflowRunHistoryByDecision,
    workflowRunHistoryLoadingByDecision,
    workflowRunHistoryErrorByDecision,
    invalidateDecisionRunHistory,
    invalidateAllRunHistory,
    onOpenWorkspacePreview: openWorkspacePreview,
  });

  const handleStrategySelect = useCallback((strategy: DecisionStrategy): void => {
    selectStrategy(strategy);
    setDecisionId(strategy.id);
  }, [selectStrategy, setDecisionId]);

  const handleStrategyCreated = useCallback((createdStrategy: DecisionStrategy): void => {
    prependStrategyAndSelect(createdStrategy);
    setDecisionId(createdStrategy.id);
  }, [prependStrategyAndSelect, setDecisionId]);

  const {
    isLoadingStrategyDetails,
    openSelectedStrategyDetails,
    resetStrategyDetailsLoading,
  } = useStrategyDetailsLoader({
    selectedStrategy,
    openCreateStage,
    setDecisionId,
    openStrategyDetails,
    replaceDraftFromStrategy,
    upsertStrategy,
  });

  const { saveCreatedStrategy } = useStrategyCreation({
    createDraft,
    onCreated: handleStrategyCreated,
    onResetDraft: resetCreateDraft,
    onComplete: openDashboardList,
  });

  const {
    openCreateStrategyForm,
    cancelCreateStrategy,
    enterWorkflowFromStrategy,
    viewSelectedStrategyRunHistory,
  } = useBoardroomActions({
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
  });

  const {
    strategyListProps,
    strategyDetailsProps,
    decisionAncestryPanelProps,
    createStrategyStageProps,
    agentConfigModalProps,
    workflowEditorStageProps,
    workflowPreviewStageProps,
  } = useBoardroomStageProps({
    strategyList: {
      strategies,
      isLoading: isLoadingStrategies,
      error: strategyLoadError,
      selectedStrategyId,
      onSelect: handleStrategySelect,
      onCreate: openCreateStrategyForm,
    },
    details: {
      selectedStrategy,
      isLoadingStrategyDetails,
      isSelectedStrategyRunHistoryLoading,
      selectedStrategyRunHistoryCount,
      selectedStrategyRunHistoryError,
      onOpenDetails: openSelectedStrategyDetails,
      onViewHistory: viewSelectedStrategyRunHistory,
      onRunAnalysis: enterWorkflowFromStrategy,
    },
    decisionAncestry: {
      selectedStrategy,
      selectedStrategyRunHistory,
      isSelectedStrategyRunHistoryLoading,
      selectedStrategyRunHistoryError,
    },
    create: {
      createDraft,
      isCreateReadOnly,
      isCoreCollapsed,
      isCapitalCollapsed,
      isRiskCollapsed,
      riskAdjustedValue,
      riskAdjustedRoi,
      weightedCapitalScore,
      riskScore,
      onDraftNameChange: updateCreateTitle,
      onToggleCore: toggleCore,
      onToggleCapital: toggleCapital,
      onToggleRisk: toggleRisk,
      onUpdateCoreProperty: updateCoreProperty,
      onUpdateCapitalAllocation: updateCapitalAllocation,
      onUpdateRiskProperty: updateRiskProperty,
      onUpdateSection: updateCreateSection,
      onRunAnalysis: enterWorkflowFromStrategy,
      onCancel: cancelCreateStrategy,
      onSave: saveCreatedStrategy,
    },
    agentConfig: {
      agentConfigs,
      selectedAgentId,
      researchProvider,
      researchOptions: researchToolOptions,
      onSelectAgent: setSelectedAgentId,
      onAddAgent: addCustomReviewAgent,
      onRemoveAgent: removeAgentById,
      onUpdateAgentField: updateAgentField,
      onProviderChange: updateProvider,
      syncStatus,
      syncMessage,
      isDirty,
      onSave: saveConfigs,
      onReset: resetConfigs,
      onResearchProviderChange: setResearchProvider,
    },
    editor: {
      selectedStrategy,
      includeExternalResearch,
      researchProvider,
      includeRedTeamPersonas,
      interactionRounds,
      researchProviderConfigured,
      nodes,
      selectedNode,
      selectedNodeId,
      expandedNodeId,
      logLines,
      isRunning,
      runLabel,
      error,
      onBack: openDashboardList,
      onRun: handleRunClick,
      onNodeClick: handleNodeClick,
      onIncludeExternalResearchChange: setIncludeExternalResearch,
      onIncludeRedTeamPersonasChange: setIncludeRedTeamPersonas,
      onInteractionRoundsChange: setInteractionRounds,
    },
    preview: {
      activeReport,
      activeMetrics,
      reportStates,
      clampedPreviewIndex,
      error,
      result,
      activeRecommendation,
      activeRecommendationTone,
      summaryLine,
      blockedReviewCount,
      missingSectionCount,
      activeGovernanceRows,
      activeReviews,
      logLines,
      onPreviewIndexChange: setPreviewIndex,
    },
  });

  const headerProps = useMemo(
    () => ({
      appStage,
      workspaceView,
      activeTab,
      selectedStrategy,
      isRunning,
      runLabel,
      onHome: openHome,
      onOpenDashboard: openDashboardList,
      onOpenAgentConfig: openAgentConfig,
      onSetActiveTab: setActiveTab,
      onRun: handleRunClick,
    }),
    [
      appStage,
      workspaceView,
      activeTab,
      selectedStrategy,
      isRunning,
      runLabel,
      openHome,
      openDashboardList,
      openAgentConfig,
      setActiveTab,
      handleRunClick,
    ],
  );

  const stageContentProps = useMemo(
    () => ({
      appStage,
      workspaceView,
      activeTab,
      strategyListProps,
      strategyDetailsProps,
      decisionAncestryPanelProps,
      createStrategyStageProps,
      agentConfigModalProps,
      workflowEditorStageProps,
      workflowPreviewStageProps,
    }),
    [
      appStage,
      workspaceView,
      activeTab,
      strategyListProps,
      strategyDetailsProps,
      decisionAncestryPanelProps,
      createStrategyStageProps,
      agentConfigModalProps,
      workflowEditorStageProps,
      workflowPreviewStageProps,
    ],
  );

  const footerProps = useMemo(
    () => ({
      selectedStrategy,
    }),
    [selectedStrategy],
  );

  return {
    headerProps,
    stageContentProps,
    footerProps,
  };
}
