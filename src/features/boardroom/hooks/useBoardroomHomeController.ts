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
    // updateNodeStatus("3", "COMPLETED");
    updateCreateTitle,
    updateCreateSection,
    updateCoreProperty,
    updateCapitalAllocation,
    updateRiskProperty,
    upsertMitigation,
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
    liveInfluence,
    thinkingAgents,
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
    openStrategyDetailsFor,
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

  const [queuedRerunStrategyId, setQueuedRerunStrategyId] = useState<string | null>(null);

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

  const openReportFromStrategy = useCallback(
    (strategy: DecisionStrategy, options?: { runId?: number }): void => {
      selectStrategy(strategy);
      setDecisionId(strategy.id);

      const historyEntries = workflowRunHistoryByDecision[strategy.id] ?? [];
      if (historyEntries.length === 0) {
        openWorkspacePreview();
        return;
      }

      const selectedRunId = options?.runId;
      const prioritizedEntries = typeof selectedRunId === "number"
        ? [
          ...historyEntries.filter((entry) => entry.id === selectedRunId),
          ...historyEntries.filter((entry) => entry.id !== selectedRunId),
        ]
        : historyEntries;
      const prioritizedStates = prioritizedEntries.map((entry) => entry.state).filter((state): state is unknown => Boolean(state));

      if (prioritizedStates.length > 0) {
        showWorkflowRunHistory(prioritizedStates);
      }
      openWorkspacePreview();
    },
    [openWorkspacePreview, selectStrategy, setDecisionId, showWorkflowRunHistory, workflowRunHistoryByDecision],
  );

  const openForgeFromStrategy = useCallback(
    (strategy: DecisionStrategy): void => {
      selectStrategy(strategy);
      setDecisionId(strategy.id);
      openStrategyDetailsFor(strategy);
    },
    [openStrategyDetailsFor, selectStrategy, setDecisionId],
  );

  const openRunHistoryFromStrategy = useCallback(
    (strategy: DecisionStrategy, options?: { runId?: number }): void => {
      openReportFromStrategy(strategy, options);
    },
    [openReportFromStrategy],
  );

  const rerunStrategyFromGallery = useCallback(
    (strategy: DecisionStrategy): void => {
      selectStrategy(strategy);
      setDecisionId(strategy.id);
      openWorkspaceEditor();
      initializeWorkflowSession(strategy);
      setQueuedRerunStrategyId(strategy.id);
    },
    [initializeWorkflowSession, openWorkspaceEditor, selectStrategy, setDecisionId],
  );

  useEffect(() => {
    if (!queuedRerunStrategyId || appStage !== "workspace" || activeTab !== "editor") {
      return;
    }
    if (!selectedStrategy || selectedStrategy.id !== queuedRerunStrategyId || isRunning) {
      return;
    }
    handleRunClick();
    setQueuedRerunStrategyId(null);
  }, [activeTab, appStage, handleRunClick, isRunning, queuedRerunStrategyId, selectedStrategy]);

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
      workflowRunHistoryByDecision,
      onSelect: handleStrategySelect,
      onCreate: openCreateStrategyForm,
      onOpenReport: openReportFromStrategy,
      onOpenForge: openForgeFromStrategy,
      onOpenRunHistory: openRunHistoryFromStrategy,
      onRerunPipeline: rerunStrategyFromGallery,
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
      onLogMitigation: upsertMitigation,
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
      liveInfluence,
      thinkingAgents,
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
