import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Head from "next/head";
import { useEffect, useMemo, useRef, useState } from "react";

import type { AgentConfig, LLMProvider } from "../src/config/agent_config";
import {
  PROVIDER_MODEL_OPTIONS,
  buildCustomAgentConfig,
  buildDefaultAgentConfigs,
  normalizeAgentConfigs,
  resolveModelForProvider,
} from "../src/config/agent_config";
import {
  CORE_AGENT_IDS,
  CURRENCY_FORMATTER,
  DECISION_STRATEGIES,
  DECISION_TYPE_OPTIONS,
  EDGES,
  GOVERNANCE_CHECKLIST_ITEMS,
  LEVERAGE_SCORE_OPTIONS,
  PROBABILITY_OPTIONS,
  PROVIDER_OPTIONS,
  REVERSIBILITY_OPTIONS,
  RISK_LEVEL_OPTIONS,
  STRATEGIC_ARTIFACT_SECTIONS,
  STRATEGIC_OBJECTIVE_OPTIONS,
  TIME_HORIZON_OPTIONS,
} from "../src/features/boardroom/constants";
import {
  BoardroomIcon,
  ChevronGlyph,
  ChessPieceGlyph,
  EdgePath,
  NodeGlyph,
  PlusGlyph,
  SettingsGlyph,
  TrashGlyph,
} from "../src/features/boardroom/components/icons";
import { SectionMatrixEditor, SectionMatrixView } from "../src/features/boardroom/components/section-matrix";
import type {
  ActiveTab,
  AgentConfigSyncStatus,
  ApiResult,
  AppStage,
  CreateStrategyDraft,
  DecisionStrategy,
  DraftCapitalAllocation,
  DraftCoreProperties,
  DraftRiskProperties,
  NodeStatus,
  StrategyDetailsResponse,
  StrategyListResponse,
  WorkflowNode,
  WorkflowRunHistoryResponse,
  WorkflowRunStateEntry,
  WorkspaceView,
} from "../src/features/boardroom/types";
import {
  agentModelMeta,
  asRecord,
  buildCreateDraftFromStrategy,
  buildInitialNodes,
  clampTokenInput,
  deriveRiskAdjustedRoi,
  deriveRiskAdjustedValue,
  deriveRiskScore,
  deriveWeightedCapitalScore,
  extractGovernanceRows,
  extractSnapshotMetrics,
  firstLine,
  formatCurrency,
  formatDqs,
  formatRunTimestamp,
  initialCreateStrategyDraft,
  isMatrixSectionKey,
  isSerializedSectionMatrix,
  normalizeWorkflowStates,
  recommendationForState,
  recommendationTone,
  resolveAgentChessPiece,
  serializeAgentConfigs,
  sleep,
  sortReviews,
  strategyStatusTone,
} from "../src/features/boardroom/utils";

export {
  buildCreateDraftFromStrategy,
  deriveRiskAdjustedRoi,
  deriveRiskAdjustedValue,
  deriveRiskScore,
  deriveWeightedCapitalScore,
  parseSectionMatrix,
} from "../src/features/boardroom/utils";

export const getServerSideProps: GetServerSideProps<{ tavilyConfigured: boolean }> = async () => ({
  props: {
    tavilyConfigured: (process.env.TAVILY_API_KEY ?? "").trim().length > 0,
  },
});

export default function Home({ tavilyConfigured }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [appStage, setAppStage] = useState<AppStage>("list");
  const [strategies, setStrategies] = useState<DecisionStrategy[]>(DECISION_STRATEGIES);
  const [createDraft, setCreateDraft] = useState<CreateStrategyDraft>(() => initialCreateStrategyDraft());
  const [isCreateReadOnly, setIsCreateReadOnly] = useState(false);
  const [isCoreCollapsed, setIsCoreCollapsed] = useState(false);
  const [isCapitalCollapsed, setIsCapitalCollapsed] = useState(false);
  const [isRiskCollapsed, setIsRiskCollapsed] = useState(false);
  const [isLoadingStrategies, setIsLoadingStrategies] = useState(true);
  const [isLoadingStrategyDetails, setIsLoadingStrategyDetails] = useState(false);
  const [strategyLoadError, setStrategyLoadError] = useState<string | null>(null);
  const [selectedStrategyId, setSelectedStrategyId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<WorkflowNode[]>(() => buildInitialNodes(null));
  const [decisionId, setDecisionId] = useState("");
  const [includeExternalResearch, setIncludeExternalResearch] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("editor");
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("dashboard");
  const [agentConfigs, setAgentConfigs] = useState<AgentConfig[]>(() => buildDefaultAgentConfigs());
  const [selectedAgentId, setSelectedAgentId] = useState<string>("ceo");
  const [isAgentAdvancedOpen, setIsAgentAdvancedOpen] = useState(false);
  const [agentConfigSyncStatus, setAgentConfigSyncStatus] = useState<AgentConfigSyncStatus>("loading");
  const [agentConfigSyncMessage, setAgentConfigSyncMessage] = useState("Loading from database...");
  const [lastPersistedAgentConfigsJson, setLastPersistedAgentConfigsJson] = useState(() =>
    serializeAgentConfigs(buildDefaultAgentConfigs()),
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [workflowRunHistoryByDecision, setWorkflowRunHistoryByDecision] = useState<Record<string, WorkflowRunStateEntry[]>>({});
  const [workflowRunHistoryLoadingByDecision, setWorkflowRunHistoryLoadingByDecision] = useState<Record<string, boolean>>({});
  const [workflowRunHistoryErrorByDecision, setWorkflowRunHistoryErrorByDecision] = useState<Record<string, string | null>>({});
  const [logLines, setLogLines] = useState<string[]>([]);
  const workflowRunHistoryByDecisionRef = useRef(workflowRunHistoryByDecision);
  const workflowRunHistoryLoadingByDecisionRef = useRef(workflowRunHistoryLoadingByDecision);

  const selectedStrategy = useMemo(() => strategies.find((strategy) => strategy.id === selectedStrategyId) ?? null, [strategies, selectedStrategyId]);
  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedNodeId) ?? null, [nodes, selectedNodeId]);
  const normalizedAgentConfigs = useMemo(() => normalizeAgentConfigs(agentConfigs), [agentConfigs]);
  const selectedAgentConfig = useMemo(
    () => normalizedAgentConfigs.find((config) => config.id === selectedAgentId) ?? normalizedAgentConfigs[0] ?? null,
    [normalizedAgentConfigs, selectedAgentId],
  );

  const runLabel = useMemo(() => {
    if (isRunning) {
      return "Running Pipeline...";
    }
    return "Execute Pipeline";
  }, [isRunning]);

  const reportStates = useMemo(() => normalizeWorkflowStates(result), [result]);
  const clampedPreviewIndex = reportStates.length > 0 ? Math.min(previewIndex, reportStates.length - 1) : 0;
  const activeReport = reportStates[clampedPreviewIndex] ?? null;
  const selectedStrategyRunHistory = useMemo(() => {
    if (!selectedStrategy) {
      return [];
    }
    return workflowRunHistoryByDecision[selectedStrategy.id] ?? [];
  }, [selectedStrategy, workflowRunHistoryByDecision]);
  const selectedStrategyRunHistoryCount = selectedStrategyRunHistory.length;
  const isSelectedStrategyRunHistoryLoading = selectedStrategy ? Boolean(workflowRunHistoryLoadingByDecision[selectedStrategy.id]) : false;
  const selectedStrategyRunHistoryError = selectedStrategy ? workflowRunHistoryErrorByDecision[selectedStrategy.id] ?? null : null;
  const activeMetrics = useMemo(() => (activeReport ? extractSnapshotMetrics(activeReport) : null), [activeReport]);
  const activeGovernanceRows = useMemo(() => (activeReport ? extractGovernanceRows(activeReport) : []), [activeReport]);
  const activeReviews = useMemo(() => (activeReport ? sortReviews(activeReport) : []), [activeReport]);
  const activeRecommendation = activeReport ? recommendationForState(activeReport) : null;
  const activeRecommendationTone = activeRecommendation ? recommendationTone(activeRecommendation) : null;
  const blockedReviewCount = activeReviews.filter((review) => review.blocked).length;
  const missingSectionCount = activeReport?.missing_sections.length ?? 0;
  const summaryLine = activeReport ? firstLine(activeReport.synthesis?.executive_summary ?? "") : "";
  const riskAdjustedValue = useMemo(() => deriveRiskAdjustedValue(createDraft), [createDraft]);
  const riskAdjustedRoi = useMemo(() => deriveRiskAdjustedRoi(createDraft, riskAdjustedValue), [createDraft, riskAdjustedValue]);
  const weightedCapitalScore = useMemo(
    () => deriveWeightedCapitalScore(createDraft, riskAdjustedRoi),
    [createDraft, riskAdjustedRoi],
  );
  const riskScore = useMemo(() => deriveRiskScore(createDraft), [createDraft]);
  const createDocumentSections = useMemo(
    () => STRATEGIC_ARTIFACT_SECTIONS.filter((section) => section.key !== "executiveSummary"),
    [],
  );
  const agentConfigsSnapshot = useMemo(() => serializeAgentConfigs(normalizedAgentConfigs), [normalizedAgentConfigs]);
  const agentConfigsDirty = useMemo(
    () => agentConfigsSnapshot !== lastPersistedAgentConfigsJson,
    [agentConfigsSnapshot, lastPersistedAgentConfigsJson],
  );
  const agentConfigSyncTone = useMemo(() => {
    if (agentConfigSyncStatus === "error") {
      return "error";
    }
    if (agentConfigSyncStatus === "dirty") {
      return "dirty";
    }
    if (agentConfigSyncStatus === "saving" || agentConfigSyncStatus === "loading") {
      return "saving";
    }
    return "saved";
  }, [agentConfigSyncStatus]);
  const showAgentConfigSyncState = useMemo(
    () =>
      agentConfigSyncStatus === "loading" ||
      agentConfigSyncStatus === "saving" ||
      agentConfigSyncStatus === "dirty" ||
      agentConfigSyncStatus === "error",
    [agentConfigSyncStatus],
  );
  const showAgentConfigActionButtons = useMemo(() => agentConfigSyncStatus === "dirty" || agentConfigSyncStatus === "error", [agentConfigSyncStatus]);
  const showAgentConfigFooter = showAgentConfigSyncState || showAgentConfigActionButtons;

  useEffect(() => {
    setPreviewIndex(0);
  }, [result]);

  useEffect(() => {
    setIsAgentAdvancedOpen(false);
  }, [selectedAgentId]);

  useEffect(() => {
    let cancelled = false;

    async function loadStrategies(): Promise<void> {
      setIsLoadingStrategies(true);
      setStrategyLoadError(null);

      try {
        const response = await fetch("/api/strategies?includeSensitive=true");
        const json = (await response.json()) as StrategyListResponse;
        if (!response.ok) {
          throw new Error(json.details || json.error || "Failed to load strategic decision log.");
        }

        const remoteStrategies = Array.isArray(json.strategies) ? json.strategies : [];
        if (cancelled) {
          return;
        }

        if (remoteStrategies.length > 0) {
          setStrategies(remoteStrategies);
          return;
        }

        setStrategies([]);
        setStrategyLoadError("No records found in the Strategic Decision Log.");
      } catch (loadError) {
        if (cancelled) {
          return;
        }
        const message = loadError instanceof Error ? loadError.message : String(loadError);
        setStrategyLoadError(`${message} Using local fallback strategies.`);
      } finally {
        if (!cancelled) {
          setIsLoadingStrategies(false);
        }
      }
    }

    loadStrategies();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (agentConfigSyncStatus === "loading" || agentConfigSyncStatus === "saving" || agentConfigSyncStatus === "error") {
      return;
    }

    if (agentConfigsDirty && agentConfigSyncStatus !== "dirty") {
      setAgentConfigSyncStatus("dirty");
      setAgentConfigSyncMessage("Unsaved changes.");
      return;
    }

    if (!agentConfigsDirty && agentConfigSyncStatus === "dirty") {
      setAgentConfigSyncStatus("saved");
      setAgentConfigSyncMessage("All changes saved.");
    }
  }, [agentConfigsDirty, agentConfigSyncStatus]);

  useEffect(() => {
    if (!selectedStrategyId) {
      return;
    }

    const exists = strategies.some((strategy) => strategy.id === selectedStrategyId);
    if (!exists) {
      setSelectedStrategyId(null);
    }
  }, [strategies, selectedStrategyId]);

  useEffect(() => {
    workflowRunHistoryByDecisionRef.current = workflowRunHistoryByDecision;
  }, [workflowRunHistoryByDecision]);

  useEffect(() => {
    workflowRunHistoryLoadingByDecisionRef.current = workflowRunHistoryLoadingByDecision;
  }, [workflowRunHistoryLoadingByDecision]);

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
  }, [selectedStrategyId]);

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
    const reviewRoles = normalizedAgentConfigs.map((config) => config.role).filter((role) => role.trim().length > 0);
    const summary = reviewRoles.length > 0 ? reviewRoles.join(", ") : "No reviewers configured";

    setNodes((prev) =>
      prev.map((node) =>
        node.id === "3"
          ? {
            ...node,
            subtitle: summary,
            tasks: reviewRoles,
          }
          : node,
      ),
    );
  }, [normalizedAgentConfigs]);

  useEffect(() => {
    const exists = normalizedAgentConfigs.some((config) => config.id === selectedAgentId);
    if (!exists) {
      setSelectedAgentId(normalizedAgentConfigs[0]?.id ?? "ceo");
    }
  }, [normalizedAgentConfigs, selectedAgentId]);

  useEffect(() => {
    let cancelled = false;

    async function loadAgentConfigs(): Promise<void> {
      setAgentConfigSyncStatus("loading");
      setAgentConfigSyncMessage("Loading from database...");

      try {
        const response = await fetch("/api/agent-configs?includeSensitive=true");
        const json = (await response.json()) as {
          agentConfigs?: AgentConfig[];
          persisted?: boolean;
          error?: string;
          details?: string;
        };

        if (!response.ok) {
          throw new Error(json.details || json.error || "Failed to load agent configurations.");
        }

        const normalized = normalizeAgentConfigs(json.agentConfigs);
        if (cancelled) {
          return;
        }

        setAgentConfigs(normalized);
        setLastPersistedAgentConfigsJson(serializeAgentConfigs(normalized));
        setAgentConfigSyncStatus("saved");
        setAgentConfigSyncMessage(json.persisted ? "Loaded from database." : "Using default configuration.");
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        const message = loadError instanceof Error ? loadError.message : String(loadError);
        setAgentConfigSyncStatus("error");
        setAgentConfigSyncMessage(message);
      }
    }

    loadAgentConfigs();

    return () => {
      cancelled = true;
    };
  }, []);

  function addLog(message: string): void {
    const timestamp = new Date().toLocaleTimeString([], { hour12: false });
    setLogLines((prev) => [...prev, `${timestamp}  ${message}`]);
  }

  function updateNodeStatus(id: string, status: NodeStatus): void {
    setNodes((prev) => prev.map((node) => (node.id === id ? { ...node, status } : node)));
  }

  function hasSubtasks(node: WorkflowNode): boolean {
    return (node.tasks?.length ?? 0) > 1;
  }

  function handleNodeClick(node: WorkflowNode): void {
    setSelectedNodeId(node.id);
    if (!hasSubtasks(node)) {
      setExpandedNodeId(null);
      return;
    }
    setExpandedNodeId((prev) => (prev === node.id ? null : node.id));
  }

  function handleStrategySelect(strategy: DecisionStrategy): void {
    setSelectedStrategyId(strategy.id);
    setDecisionId(strategy.id);
  }

  function openCreateStrategyForm(): void {
    setCreateDraft(initialCreateStrategyDraft());
    setIsCreateReadOnly(false);
    setIsLoadingStrategyDetails(false);
    setIsCoreCollapsed(false);
    setIsCapitalCollapsed(false);
    setIsRiskCollapsed(false);
    setAppStage("create");
  }

  function openSelectedStrategyDetails(): void {
    if (!selectedStrategy || isLoadingStrategyDetails) {
      return;
    }

    const selectedAtClick = selectedStrategy;
    const selectedId = selectedAtClick.id;

    setCreateDraft(buildCreateDraftFromStrategy(selectedAtClick));
    setIsCreateReadOnly(true);
    setIsCoreCollapsed(false);
    setIsCapitalCollapsed(false);
    setIsRiskCollapsed(false);
    setDecisionId(selectedId);
    setAppStage("create");
    setIsLoadingStrategyDetails(true);

    void (async () => {
      try {
        const response = await fetch(`/api/strategies/${encodeURIComponent(selectedId)}?includeSensitive=true`);
        const json = (await response.json()) as StrategyDetailsResponse;
        if (!response.ok || !json.strategy) {
          return;
        }

        if (json.strategy.id !== selectedId) {
          return;
        }

        setStrategies((prev) =>
          prev.map((entry) => (entry.id === selectedId ? { ...entry, ...json.strategy } : entry)),
        );
        setCreateDraft(buildCreateDraftFromStrategy(json.strategy));
      } catch {
        // Keep current draft data if enrichment fails.
      } finally {
        setIsLoadingStrategyDetails(false);
      }
    })();
  }

  function updateCreateSection(sectionKey: string, value: string): void {
    setCreateDraft((prev) => ({
      ...prev,
      sections: {
        ...prev.sections,
        [sectionKey]: value,
      },
    }));
  }

  function updateCoreProperty(field: keyof DraftCoreProperties, value: string): void {
    setCreateDraft((prev) => ({
      ...prev,
      coreProperties: {
        ...prev.coreProperties,
        [field]: value,
      },
    }));
  }

  function updateCapitalAllocation(field: keyof DraftCapitalAllocation, value: string | number): void {
    setCreateDraft((prev) => ({
      ...prev,
      capitalAllocation: {
        ...prev.capitalAllocation,
        [field]:
          field === "investmentRequired" || field === "grossBenefit12m"
            ? typeof value === "number"
              ? value
              : Number(value) || 0
            : String(value),
      },
    }));
  }

  function updateRiskProperty(field: keyof DraftRiskProperties, value: string): void {
    setCreateDraft((prev) => ({
      ...prev,
      riskProperties: {
        ...prev.riskProperties,
        [field]: value,
      },
    }));
  }

  function markAgentConfigsDirty(): void {
    if (agentConfigSyncStatus === "loading") {
      return;
    }
    setAgentConfigSyncStatus("dirty");
    setAgentConfigSyncMessage("Unsaved changes.");
  }

  function updateAgentConfig(agentId: string, updater: (current: AgentConfig) => AgentConfig): void {
    setAgentConfigs((prev) => {
      const current = normalizeAgentConfigs(prev);
      return current.map((config) => (config.id === agentId ? updater(config) : config));
    });
    markAgentConfigsDirty();
  }

  function updateAgentField<K extends keyof AgentConfig>(agentId: string, field: K, value: AgentConfig[K]): void {
    updateAgentConfig(agentId, (current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handleProviderChange(agentId: string, provider: LLMProvider): void {
    updateAgentConfig(agentId, (current) => ({
      ...current,
      provider,
      model: resolveModelForProvider(provider, current.model),
    }));
  }

  function addCustomReviewAgent(): void {
    const nextConfigs = normalizeAgentConfigs(agentConfigs);
    const customAgent = buildCustomAgentConfig(nextConfigs);
    setAgentConfigs(normalizeAgentConfigs([...nextConfigs, customAgent]));
    setSelectedAgentId(customAgent.id);
    markAgentConfigsDirty();
  }

  function removeAgentById(agentId: string): void {
    if (CORE_AGENT_IDS.has(agentId)) {
      return;
    }

    const nextConfigs = normalizeAgentConfigs(agentConfigs).filter((config) => config.id !== agentId);
    if (nextConfigs.length === 0) {
      return;
    }

    const nextSelected = selectedAgentId === agentId ? nextConfigs[0]?.id ?? "ceo" : selectedAgentId;
    setAgentConfigs(nextConfigs);
    setSelectedAgentId(nextSelected);
    markAgentConfigsDirty();
  }

  async function persistAgentConfigs(configs: AgentConfig[]): Promise<void> {
    const response = await fetch("/api/agent-configs", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ agentConfigs: configs }),
    });

    const json = (await response.json()) as { error?: string; details?: string };
    if (!response.ok) {
      throw new Error(json.details || json.error || "Failed to persist agent configurations.");
    }
  }

  async function handleSaveAgentConfigs(): Promise<void> {
    if (agentConfigSyncStatus === "loading" || agentConfigSyncStatus === "saving") {
      return;
    }

    setAgentConfigSyncStatus("saving");
    setAgentConfigSyncMessage("Saving to database...");

    try {
      await persistAgentConfigs(normalizedAgentConfigs);
      const savedAt = new Date().toLocaleTimeString([], { hour12: false });
      setLastPersistedAgentConfigsJson(agentConfigsSnapshot);
      setAgentConfigSyncStatus("saved");
      setAgentConfigSyncMessage(`Saved at ${savedAt}.`);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : String(saveError);
      setAgentConfigSyncStatus("error");
      setAgentConfigSyncMessage(message);
    }
  }

  function resetAgentConfigs(): void {
    const defaults = buildDefaultAgentConfigs();
    setAgentConfigs(defaults);
    setSelectedAgentId(defaults[0]?.id ?? "ceo");
    markAgentConfigsDirty();
  }

  function cancelCreateStrategy(): void {
    setIsCreateReadOnly(false);
    setIsLoadingStrategyDetails(false);
    setIsCoreCollapsed(false);
    setIsCapitalCollapsed(false);
    setIsRiskCollapsed(false);
    setAppStage("list");
  }

  function saveCreatedStrategy(): void {
    const strategyName = createDraft.name.trim().length > 0 ? createDraft.name.trim() : "Untitled Strategic Decision";
    const strategyOwner = createDraft.owner.trim().length > 0 ? createDraft.owner.trim() : "Unassigned";
    const parsedReviewDate = createDraft.reviewDate.trim().length > 0 ? new Date(createDraft.reviewDate) : null;
    const strategyReviewDate =
      parsedReviewDate && !Number.isNaN(parsedReviewDate.getTime())
        ? parsedReviewDate.toLocaleDateString("en-US", {
          month: "short",
          day: "2-digit",
          year: "numeric",
        })
        : "No review date";

    const sectionSummary = createDraft.sections.executiveSummary?.trim() ?? "";
    const strategyPrimaryKpi =
      createDraft.coreProperties.primaryKpi.trim().length > 0
        ? createDraft.coreProperties.primaryKpi.trim()
        : createDraft.primaryKpi.trim().length > 0
          ? createDraft.primaryKpi.trim()
          : "Not specified";
    const strategyObjective =
      createDraft.coreProperties.strategicObjective.trim().length > 0
        ? createDraft.coreProperties.strategicObjective.trim()
        : createDraft.strategicObjective.trim().length > 0
          ? createDraft.strategicObjective.trim()
          : "Not specified";
    const strategyInvestment =
      createDraft.capitalAllocation.investmentRequired > 0
        ? CURRENCY_FORMATTER.format(createDraft.capitalAllocation.investmentRequired)
        : createDraft.investment.trim().length > 0
          ? createDraft.investment.trim()
          : "N/A";
    const strategyConfidence =
      createDraft.capitalAllocation.probabilityOfSuccess.trim().length > 0
        ? createDraft.capitalAllocation.probabilityOfSuccess.trim()
        : createDraft.confidence.trim().length > 0
          ? createDraft.confidence.trim()
          : "N/A";
    const generatedId = Math.random().toString(16).slice(2, 10);
    const artifactSections: Record<string, string> = {
      ...createDraft.sections,
      coreProperties: JSON.stringify(createDraft.coreProperties),
      capitalAllocationModel: JSON.stringify(createDraft.capitalAllocation),
      riskProperties: JSON.stringify(createDraft.riskProperties),
    };

    const createdStrategy: DecisionStrategy = {
      id: generatedId,
      name: strategyName,
      status: "Proposed",
      owner: strategyOwner,
      reviewDate: strategyReviewDate,
      summary: sectionSummary.length > 0 ? sectionSummary : "Strategic decision artifact draft created from template.",
      primaryKpi: strategyPrimaryKpi,
      investment: strategyInvestment,
      strategicObjective: strategyObjective,
      confidence: strategyConfidence,
      artifactSections,
    };

    setStrategies((prev) => [createdStrategy, ...prev]);
    setSelectedStrategyId(createdStrategy.id);
    setDecisionId(createdStrategy.id);
    setCreateDraft(initialCreateStrategyDraft());
    setIsCreateReadOnly(false);
    setAppStage("list");
  }

  function enterWorkflowFromStrategy(): void {
    if (!selectedStrategy) {
      return;
    }
    const timestamp = new Date().toLocaleTimeString([], { hour12: false });
    setAppStage("workspace");
    setWorkspaceView("dashboard");
    setActiveTab("editor");
    setSelectedNodeId("1");
    setExpandedNodeId(null);
    setNodes(buildInitialNodes(selectedStrategy.name));
    setLogLines([`${timestamp}  Context loaded: ${selectedStrategy.name} (${selectedStrategy.id})`]);
  }

  function viewSelectedStrategyRunHistory(): void {
    if (!selectedStrategy) {
      return;
    }

    const historyEntries = workflowRunHistoryByDecision[selectedStrategy.id] ?? [];
    const historyStates = historyEntries.map((entry) => entry.state).filter((state): state is unknown => Boolean(state));
    if (historyStates.length === 0) {
      return;
    }

    setResult({
      mode: "all_proposed",
      count: historyStates.length,
      results: historyStates,
    });
    setPreviewIndex(0);
    setAppStage("workspace");
    setWorkspaceView("dashboard");
    setActiveTab("preview");
  }

  function handleBrandClick(): void {
    setAppStage("list");
    setWorkspaceView("dashboard");
    setActiveTab("editor");
  }

  function handleOpenDashboard(): void {
    setAppStage("list");
    setWorkspaceView("dashboard");
  }

  function handleOpenAgentSettings(): void {
    setAppStage("workspace");
    setWorkspaceView("agent-config");
    setActiveTab("editor");
  }

  async function runStep(nodeId: string, message: string, duration = 500): Promise<void> {
    updateNodeStatus(nodeId, "RUNNING");
    addLog(message);
    await sleep(duration);
    updateNodeStatus(nodeId, "COMPLETED");
  }

  async function handleRun(): Promise<void> {
    if (isRunning) {
      return;
    }

    if (appStage !== "workspace") {
      return;
    }

    setIsRunning(true);
    setError(null);
    setResult(null);
    setLogLines([]);
    setNodes(buildInitialNodes(selectedStrategy?.name ?? null));
    setSelectedNodeId("1");
    setExpandedNodeId(null);

    const selectedDecisionId = decisionId.trim().length > 0 ? decisionId.trim() : selectedStrategy?.id ?? "";
    const externalResearchEnabledForRun = tavilyConfigured && includeExternalResearch;
    const payload: { decisionId?: string; agentConfigs: AgentConfig[]; includeExternalResearch: boolean; includeSensitive: boolean } = {
      agentConfigs: normalizedAgentConfigs,
      includeExternalResearch: externalResearchEnabledForRun,
      includeSensitive: true,
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
      await runStep("1", `${inputSummary} | External research: ${externalResearchEnabledForRun ? "On" : "Off"}`, 350);
      await runStep("2", "Drafting strategic decision document", 450);
      await runStep("3", "Running CEO, CFO, CTO, and Compliance reviews", 700);
      await runStep("4", "Synthesizing reviews and computing DQS", 500);
      await runStep("5", "Generating PRD package", 500);

      updateNodeStatus("6", "RUNNING");
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
      updateNodeStatus("6", "COMPLETED");
      addLog("Pipeline execution complete");
      setActiveTab("preview");
    } catch (runError) {
      const message = runError instanceof Error ? runError.message : String(runError);
      setError(message);
      updateNodeStatus("6", "FAILED");
      addLog(`Pipeline failed: ${message}`);
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <>
      <Head>
        <title>Boardroom</title>
        <meta name="description" content="Multi-Agent Workflow Engine" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </Head>

      <div className="boardroom-shell">
        <header className="boardroom-header">
          <div className="boardroom-header-left">
            <button type="button" className="boardroom-brand boardroom-brand-button" onClick={handleBrandClick}>
              <div className="boardroom-brand-icon" aria-hidden="true">
                <BoardroomIcon />
              </div>
              <div className="boardroom-brand-copy">
                <h1>Boardroom</h1>
                <p>Multi-Agent Workflow Engine</p>
              </div>
            </button>
            <span className="boardroom-nav-divider" aria-hidden="true" />
            <div className="workspace-view-tabs" role="tablist" aria-label="Workspace section mode">
              <button
                type="button"
                role="tab"
                aria-selected={appStage !== "workspace" || workspaceView === "dashboard"}
                className={appStage !== "workspace" || workspaceView === "dashboard" ? "active" : ""}
                onClick={handleOpenDashboard}
              >
                Dashboard
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={appStage === "workspace" && workspaceView === "agent-config"}
                className={appStage === "workspace" && workspaceView === "agent-config" ? "active" : ""}
                onClick={handleOpenAgentSettings}
              >
                Agent Config
              </button>
            </div>
          </div>

          {appStage === "workspace" && workspaceView === "dashboard" && selectedStrategy ? (
            <div className="boardroom-controls">
              <div className="boardroom-tabs" role="tablist" aria-label="Boardroom output mode">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "editor"}
                  className={activeTab === "editor" ? "active" : ""}
                  onClick={() => setActiveTab("editor")}
                >
                  Workflow Editor
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "preview"}
                  className={activeTab === "preview" ? "active" : ""}
                  onClick={() => setActiveTab("preview")}
                >
                  Output Preview
                </button>
              </div>

              <button type="button" className="boardroom-execute" onClick={handleRun} disabled={isRunning}>
                <span className={isRunning ? "spinner" : "play-glyph"} aria-hidden="true" />
                {runLabel}
              </button>
            </div>
          ) : null}
        </header>

        <section className="boardroom-main">
          {appStage === "list" ? (
            <section className="strategy-stage">
              <aside className="strategy-sidebar">
                <div className="strategy-sidebar-header">
                  <div className="strategy-sidebar-title">
                    <h2>Strategic Decisions</h2>
                    <p>Select a brief to review before initiating AI analysis.</p>
                  </div>
                  <button type="button" className="strategy-add-button" aria-label="Add strategy" onClick={openCreateStrategyForm}>
                    +
                  </button>
                </div>

                <div className="strategy-list" aria-label="Decision strategy list">
                  {isLoadingStrategies ? <p className="strategy-list-state">Loading strategies from Strategic Decision Log...</p> : null}
                  {!isLoadingStrategies && strategyLoadError ? (
                    <p className="strategy-list-state error">{strategyLoadError}</p>
                  ) : null}
                  {!isLoadingStrategies && !strategyLoadError && strategies.length === 0 ? (
                    <p className="strategy-list-state">No strategies found in the Strategic Decision Log.</p>
                  ) : null}
                  {!isLoadingStrategies
                    ? strategies.map((strategy) => {
                      const active = selectedStrategy?.id === strategy.id;
                      const tone = strategyStatusTone(strategy.status);
                      return (
                        <button
                          key={strategy.id}
                          type="button"
                          className={`strategy-list-item ${active ? "selected" : ""}`}
                          onClick={() => handleStrategySelect(strategy)}
                        >
                          <div className="strategy-list-head">
                            <h3>{strategy.name}</h3>
                            <span className={`strategy-status tone-${tone}`}>{strategy.status}</span>
                          </div>
                          <div className="strategy-list-meta">
                            <span>{strategy.owner}</span>
                            <span>{strategy.reviewDate}</span>
                          </div>
                        </button>
                      );
                    })
                    : null}
                </div>
              </aside>

              <div className="strategy-preview">
                {selectedStrategy ? (
                  <article className="strategy-preview-card">
                    <header className="strategy-preview-header">
                      <div>
                        <div className="strategy-preview-meta">
                          <span className={`strategy-status tone-${strategyStatusTone(selectedStrategy.status)}`}>
                            {selectedStrategy.status}
                          </span>
                          <span>ID: {selectedStrategy.id}</span>
                        </div>
                        <h2>{selectedStrategy.name}</h2>
                      </div>
                    </header>

                    <p className="strategy-summary">{selectedStrategy.summary}</p>

                    <div className="strategy-metrics">
                      <div className="strategy-metric-card">
                        <span>Primary KPI Target</span>
                        <strong>{selectedStrategy.primaryKpi}</strong>
                      </div>
                      <div className="strategy-metric-card">
                        <span>Confidence</span>
                        <strong>{selectedStrategy.confidence}</strong>
                      </div>
                      <div className="strategy-metric-card">
                        <span>Estimated Investment</span>
                        <strong>{selectedStrategy.investment}</strong>
                      </div>
                      <div className="strategy-metric-card">
                        <span>Strategic Objective</span>
                        <strong>{selectedStrategy.strategicObjective}</strong>
                      </div>
                    </div>

                    <div className="strategy-preview-actions">
                      <button
                        type="button"
                        className="strategy-action-button strategy-action-secondary"
                        onClick={openSelectedStrategyDetails}
                        disabled={isLoadingStrategyDetails}
                      >
                        {isLoadingStrategyDetails ? "Loading Details..." : "View Details"}
                      </button>

                      {isSelectedStrategyRunHistoryLoading ? (
                        <button type="button" className="strategy-action-button strategy-action-history" disabled>
                          Checking Previous Runs...
                        </button>
                      ) : selectedStrategyRunHistoryCount > 0 ? (
                        <button type="button" className="strategy-action-button strategy-action-history" onClick={viewSelectedStrategyRunHistory}>
                          View Previous Runs ({selectedStrategyRunHistoryCount})
                        </button>
                      ) : null}

                      <button type="button" className="strategy-action-button strategy-run-button" onClick={enterWorkflowFromStrategy}>
                        <span className="play-glyph" aria-hidden="true" />
                        Run Analysis Pipeline
                      </button>
                    </div>

                    {selectedStrategyRunHistoryError ? (
                      <p className="strategy-history-error">{selectedStrategyRunHistoryError}</p>
                    ) : null}
                  </article>
                ) : (
                  <div className="strategy-empty-state">
                    <h2>Select a Strategy</h2>
                    <p>Choose a decision strategy from the list to preview context, metrics, and launch the pipeline.</p>
                  </div>
                )}
              </div>
            </section>
          ) : appStage === "create" ? (
            <section className="create-strategy-stage">
              <div className="create-reference-frame">
                <article className="create-reference-card">
                  <div className="create-reference-body">
                    <div className="create-reference-top">
                      <div className="create-reference-target-wrap" aria-hidden="true">
                        <span className="create-reference-target">◉</span>
                      </div>
                      <div className="create-reference-version">Strategic Decision / v2.4</div>
                    </div>

                    <section className="create-title-section">
                      <label className="create-title-label">Decision Title</label>
                      <input
                        type="text"
                        value={createDraft.name}
                        onChange={(event) => setCreateDraft((prev) => ({ ...prev, name: event.target.value }))}
                        placeholder="e.g. Vel'Afrika Market Entry"
                        className="create-title-input"
                        readOnly={isCreateReadOnly}
                      />
                    </section>

                    <section className="create-control-panel">
                      <button type="button" className="create-panel-toggle" onClick={() => setIsCoreCollapsed((prev) => !prev)}>
                        <div className="create-panel-toggle-left">
                          <span className="create-panel-chevron">{isCoreCollapsed ? "›" : "⌄"}</span>
                          <h3>Core Properties</h3>
                        </div>
                        <span>{isCoreCollapsed ? "Show" : "Hide"}</span>
                      </button>
                      {!isCoreCollapsed ? (
                        <div className="create-panel-body">
                          <div className="create-property-row">
                            <div className="create-property-label">
                              <span className="create-property-icon">▾</span>
                              <span>Strategic Objective</span>
                            </div>
                            <select
                              value={createDraft.coreProperties.strategicObjective}
                              onChange={(event) => updateCoreProperty("strategicObjective", event.target.value)}
                              className="create-property-input"
                              disabled={isCreateReadOnly}
                            >
                              <option value="">Empty</option>
                              {STRATEGIC_OBJECTIVE_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="create-property-row">
                            <div className="create-property-label">
                              <span className="create-property-icon">#</span>
                              <span>Primary KPI</span>
                            </div>
                            <input
                              type="text"
                              value={createDraft.coreProperties.primaryKpi}
                              onChange={(event) => updateCoreProperty("primaryKpi", event.target.value)}
                              placeholder="Empty"
                              className="create-property-input"
                              readOnly={isCreateReadOnly}
                            />
                          </div>

                          <div className="create-property-row">
                            <div className="create-property-label">
                              <span className="create-property-icon">#</span>
                              <span>Baseline</span>
                            </div>
                            <input
                              type="text"
                              value={createDraft.coreProperties.baseline}
                              onChange={(event) => updateCoreProperty("baseline", event.target.value)}
                              placeholder="Empty"
                              className="create-property-input"
                              readOnly={isCreateReadOnly}
                            />
                          </div>

                          <div className="create-property-row">
                            <div className="create-property-label">
                              <span className="create-property-icon">#</span>
                              <span>Target</span>
                            </div>
                            <input
                              type="text"
                              value={createDraft.coreProperties.target}
                              onChange={(event) => updateCoreProperty("target", event.target.value)}
                              placeholder="Empty"
                              className="create-property-input"
                              readOnly={isCreateReadOnly}
                            />
                          </div>

                          <div className="create-property-row">
                            <div className="create-property-label">
                              <span className="create-property-icon">▾</span>
                              <span>Time Horizon</span>
                            </div>
                            <select
                              value={createDraft.coreProperties.timeHorizon}
                              onChange={(event) => updateCoreProperty("timeHorizon", event.target.value)}
                              className="create-property-input"
                              disabled={isCreateReadOnly}
                            >
                              <option value="">Empty</option>
                              {TIME_HORIZON_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="create-property-row">
                            <div className="create-property-label">
                              <span className="create-property-icon">▾</span>
                              <span>Decision Type</span>
                            </div>
                            <select
                              value={createDraft.coreProperties.decisionType}
                              onChange={(event) => updateCoreProperty("decisionType", event.target.value)}
                              className="create-property-input"
                              disabled={isCreateReadOnly}
                            >
                              <option value="">Empty</option>
                              {DECISION_TYPE_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ) : null}
                    </section>

                    <section className="create-control-panel">
                      <button type="button" className="create-panel-toggle" onClick={() => setIsCapitalCollapsed((prev) => !prev)}>
                        <div className="create-panel-toggle-left">
                          <span className="create-panel-chevron">{isCapitalCollapsed ? "›" : "⌄"}</span>
                          <h3>Capital Allocation Model</h3>
                        </div>
                        <span>{isCapitalCollapsed ? "Show" : "Hide"}</span>
                      </button>
                      {!isCapitalCollapsed ? (
                        <div className="create-panel-body">
                          <div className="create-property-row">
                            <div className="create-property-label wide">
                              <span className="create-property-icon">#</span>
                              <span>Investment Required</span>
                            </div>
                            <div className="create-property-money-input">
                              <span>$</span>
                              <input
                                type="number"
                                value={createDraft.capitalAllocation.investmentRequired || ""}
                                onChange={(event) => updateCapitalAllocation("investmentRequired", event.target.value)}
                                placeholder="0"
                                className="create-property-input"
                                readOnly={isCreateReadOnly}
                              />
                            </div>
                          </div>

                          <div className="create-property-row">
                            <div className="create-property-label wide">
                              <span className="create-property-icon">#</span>
                              <span>12-Month Gross Benefit</span>
                            </div>
                            <div className="create-property-money-input">
                              <span>$</span>
                              <input
                                type="number"
                                value={createDraft.capitalAllocation.grossBenefit12m || ""}
                                onChange={(event) => updateCapitalAllocation("grossBenefit12m", event.target.value)}
                                placeholder="0"
                                className="create-property-input"
                                readOnly={isCreateReadOnly}
                              />
                            </div>
                          </div>

                          <div className="create-property-row">
                            <div className="create-property-label wide">
                              <span className="create-property-icon">▾</span>
                              <span>Probability of Success</span>
                            </div>
                            <select
                              value={createDraft.capitalAllocation.probabilityOfSuccess}
                              onChange={(event) => updateCapitalAllocation("probabilityOfSuccess", event.target.value)}
                              className="create-property-input"
                              disabled={isCreateReadOnly}
                            >
                              <option value="">Empty</option>
                              {PROBABILITY_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="create-property-row formula">
                            <div className="create-property-label wide">
                              <span className="create-property-icon">Σ</span>
                              <span>Risk-Adjusted Value</span>
                            </div>
                            <div className="create-property-formula-value">{formatCurrency(riskAdjustedValue)}</div>
                          </div>

                          <div className="create-property-row formula">
                            <div className="create-property-label wide">
                              <span className="create-property-icon">Σ</span>
                              <span>Risk-Adjusted ROI</span>
                            </div>
                            <div className="create-property-formula-value">
                              {riskAdjustedRoi !== null ? `${(riskAdjustedRoi * 100).toFixed(1)}%` : "Empty"}
                            </div>
                          </div>

                          <div className="create-property-row">
                            <div className="create-property-label wide">
                              <span className="create-property-icon">▾</span>
                              <span>Strategic Leverage Score</span>
                            </div>
                            <select
                              value={createDraft.capitalAllocation.strategicLeverageScore}
                              onChange={(event) => updateCapitalAllocation("strategicLeverageScore", event.target.value)}
                              className="create-property-input"
                              disabled={isCreateReadOnly}
                            >
                              <option value="">Empty</option>
                              {LEVERAGE_SCORE_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="create-property-row">
                            <div className="create-property-label wide">
                              <span className="create-property-icon">▾</span>
                              <span>Reversibility Factor</span>
                            </div>
                            <select
                              value={createDraft.capitalAllocation.reversibilityFactor}
                              onChange={(event) => updateCapitalAllocation("reversibilityFactor", event.target.value)}
                              className="create-property-input"
                              disabled={isCreateReadOnly}
                            >
                              <option value="">Empty</option>
                              {REVERSIBILITY_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="create-property-row formula highlighted">
                            <div className="create-property-label wide">
                              <span className="create-property-icon">Σ</span>
                              <span>Weighted Capital Score</span>
                            </div>
                            <div className="create-property-formula-value strong">
                              {weightedCapitalScore !== null ? weightedCapitalScore : "Empty"}
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </section>

                    <section className="create-control-panel">
                      <button type="button" className="create-panel-toggle" onClick={() => setIsRiskCollapsed((prev) => !prev)}>
                        <div className="create-panel-toggle-left">
                          <span className="create-panel-chevron">{isRiskCollapsed ? "›" : "⌄"}</span>
                          <h3>Risk Properties</h3>
                        </div>
                        <span>{isRiskCollapsed ? "Show" : "Hide"}</span>
                      </button>
                      {!isRiskCollapsed ? (
                        <div className="create-panel-body">
                          <div className="create-property-row formula">
                            <div className="create-property-label wide">
                              <span className="create-property-icon">▾</span>
                              <span>Risk Score</span>
                            </div>
                            <div className={`create-risk-score-pill tone-${riskScore ? riskScore.toLowerCase() : "empty"}`}>
                              {riskScore || "Empty"}
                            </div>
                          </div>

                          <div className="create-property-row">
                            <div className="create-property-label wide">
                              <span className="create-property-icon">▾</span>
                              <span>Regulatory Risk</span>
                            </div>
                            <select
                              value={createDraft.riskProperties.regulatoryRisk}
                              onChange={(event) => updateRiskProperty("regulatoryRisk", event.target.value)}
                              className="create-property-input"
                              disabled={isCreateReadOnly}
                            >
                              <option value="">Empty</option>
                              {RISK_LEVEL_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="create-property-row">
                            <div className="create-property-label wide">
                              <span className="create-property-icon">▾</span>
                              <span>Technical Risk</span>
                            </div>
                            <select
                              value={createDraft.riskProperties.technicalRisk}
                              onChange={(event) => updateRiskProperty("technicalRisk", event.target.value)}
                              className="create-property-input"
                              disabled={isCreateReadOnly}
                            >
                              <option value="">Empty</option>
                              {RISK_LEVEL_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="create-property-row">
                            <div className="create-property-label wide">
                              <span className="create-property-icon">▾</span>
                              <span>Operational Risk</span>
                            </div>
                            <select
                              value={createDraft.riskProperties.operationalRisk}
                              onChange={(event) => updateRiskProperty("operationalRisk", event.target.value)}
                              className="create-property-input"
                              disabled={isCreateReadOnly}
                            >
                              <option value="">Empty</option>
                              {RISK_LEVEL_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="create-property-row">
                            <div className="create-property-label wide">
                              <span className="create-property-icon">▾</span>
                              <span>Reputational Risk</span>
                            </div>
                            <select
                              value={createDraft.riskProperties.reputationalRisk}
                              onChange={(event) => updateRiskProperty("reputationalRisk", event.target.value)}
                              className="create-property-input"
                              disabled={isCreateReadOnly}
                            >
                              <option value="">Empty</option>
                              {RISK_LEVEL_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ) : null}
                    </section>

                    <section className="create-guidance-panel">
                      <div className="create-guidance-head">
                        <span className="create-guidance-dot" aria-hidden="true" />
                        <h3>Agent Evaluation Criteria</h3>
                      </div>
                      <div className="create-guidance-grid">
                        {GOVERNANCE_CHECKLIST_ITEMS.map((item) => (
                          <div key={item} className="create-guidance-item">
                            <span className="create-guidance-item-dot" aria-hidden="true" />
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                      <p>
                        These checks are evaluated automatically by executive agents during pipeline execution to determine the
                        Decision Quality Score (DQS).
                      </p>
                    </section>

                    <section className="create-sections" aria-label="Strategic decision template sections">
                      <article className="create-section">
                        <h3>
                          <span>#</span>
                          Executive Summary
                        </h3>
                        <textarea
                          value={createDraft.sections.executiveSummary ?? ""}
                          onChange={(event) => updateCreateSection("executiveSummary", event.target.value)}
                          className="create-section-textarea create-section-textarea-summary"
                          rows={4}
                          placeholder="One-paragraph decision rationale and expected impact."
                          readOnly={isCreateReadOnly}
                        />
                        <div className="create-section-divider" aria-hidden="true" />
                      </article>

                      {createDocumentSections.map((section, index) => {
                        const sectionValue = createDraft.sections[section.key] ?? "";
                        const matrixSectionKey = isMatrixSectionKey(section.key) ? section.key : null;
                        const hasStructuredMatrix = matrixSectionKey ? isSerializedSectionMatrix(sectionValue) : false;

                        return (
                          <article key={section.key} className="create-section">
                            <h3>
                              <span>{index + 1}.</span>
                              {section.title}
                            </h3>
                            {matrixSectionKey ? (
                              isCreateReadOnly ? (
                                hasStructuredMatrix ? (
                                  <SectionMatrixView sectionKey={matrixSectionKey} value={sectionValue} />
                                ) : (
                                  <textarea value={sectionValue} className="create-section-textarea" rows={7} readOnly />
                                )
                              ) : (
                                <SectionMatrixEditor
                                  sectionKey={matrixSectionKey}
                                  value={sectionValue}
                                  onChange={(nextValue) => updateCreateSection(section.key, nextValue)}
                                />
                              )
                            ) : (
                              <textarea
                                value={sectionValue}
                                onChange={(event) => updateCreateSection(section.key, event.target.value)}
                                className="create-section-textarea"
                                rows={7}
                                readOnly={isCreateReadOnly}
                              />
                            )}
                          </article>
                        );
                      })}
                    </section>
                  </div>

                  <footer className="create-strategy-footer">
                    <div className="create-strategy-footer-actions">
                      {isCreateReadOnly ? (
                        <>
                          <button type="button" className="create-save-button" onClick={enterWorkflowFromStrategy}>
                            Run Analysis Pipeline
                          </button>
                          <button type="button" className="create-cancel-button" onClick={cancelCreateStrategy}>
                            Back to Strategic Decisions
                          </button>
                        </>
                      ) : (
                        <>
                          <button type="button" className="create-save-button" onClick={saveCreatedStrategy}>
                            Save Strategy Document
                          </button>
                          <button type="button" className="create-cancel-button" onClick={cancelCreateStrategy}>
                            Cancel
                          </button>
                        </>
                      )}
                    </div>
                    <div className="create-strategy-footer-meta">
                      <span>{isCreateReadOnly ? "Strategic Decision Details" : "Strategic Decision"}</span>
                      <span className="create-strategy-footer-pill">End of Artifact</span>
                    </div>
                  </footer>
                </article>
              </div>
            </section>
          ) : workspaceView === "agent-config" ? (
            <section className="agent-config-stage" aria-label="Executive agent configuration">
              <aside className="agent-config-sidebar">
                <div className="agent-config-sidebar-head">
                  <div className="agent-config-sidebar-head-copy">
                    <h2>Agent Configuration</h2>
                    <p>Configure LLM personas and parameters</p>
                  </div>
                  <button
                    type="button"
                    className="agent-config-add"
                    onClick={addCustomReviewAgent}
                    disabled={agentConfigSyncStatus === "saving" || agentConfigSyncStatus === "loading"}
                    aria-label="Add reviewer"
                  >
                    <PlusGlyph />
                  </button>
                </div>

                <div className="agent-config-sidebar-list" role="tablist" aria-label="Agent profile selector">
                  {normalizedAgentConfigs.map((config) => {
                    const active = selectedAgentConfig?.id === config.id;
                    const canDelete = !CORE_AGENT_IDS.has(config.id);
                    const cardPiece = resolveAgentChessPiece(config.id, config.role);
                    const cardMeta = agentModelMeta(config.provider, config.model);

                    return (
                      <div
                        key={config.id}
                        role="tab"
                        aria-selected={active}
                        tabIndex={0}
                        className={`agent-config-item ${active ? "active" : ""}`}
                        onClick={() => setSelectedAgentId(config.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedAgentId(config.id);
                          }
                        }}
                      >
                        <div className={`agent-config-item-avatar ${active ? "active" : ""}`} aria-hidden="true">
                          <ChessPieceGlyph piece={cardPiece} />
                        </div>
                        <div className="agent-config-item-copy">
                          <h3>{config.role}</h3>
                          <p>{cardMeta}</p>
                        </div>

                        {canDelete ? (
                          <button
                            type="button"
                            className="agent-config-item-delete"
                            aria-label={`Delete ${config.role} agent`}
                            onClick={(event) => {
                              event.stopPropagation();
                              removeAgentById(config.id);
                            }}
                          >
                            <TrashGlyph />
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

              </aside>

              {selectedAgentConfig ? (
                <article key={selectedAgentConfig.id} className="agent-config-editor">
                  <header className="agent-config-editor-head">
                    <div className="agent-config-editor-avatar" aria-hidden="true">
                      <ChessPieceGlyph piece={resolveAgentChessPiece(selectedAgentConfig.id, selectedAgentConfig.role)} />
                    </div>
                    <div className="agent-config-editor-copy">
                      <h2>{selectedAgentConfig.role} Persona</h2>
                      <p>Define the core logic and constraints for the {selectedAgentConfig.role} agent.</p>
                    </div>
                  </header>

                  <section className="agent-config-primary-card" aria-label="Agent persona configuration">
                    <div className="agent-config-primary-grid">
                      <label className="agent-config-group" htmlFor="agent-config-role">
                        <span className="agent-config-group-label">Agent Role / Title</span>
                        <input
                          id="agent-config-role"
                          type="text"
                          className="agent-config-input"
                          value={selectedAgentConfig.role}
                          onChange={(event) => updateAgentField(selectedAgentConfig.id, "role", event.target.value)}
                          placeholder="Reviewer role label"
                        />
                      </label>

                      <label className="agent-config-group" htmlFor="agent-config-name">
                        <span className="agent-config-group-label">Full Name / Identifier</span>
                        <input
                          id="agent-config-name"
                          type="text"
                          className="agent-config-input"
                          value={selectedAgentConfig.name}
                          onChange={(event) => updateAgentField(selectedAgentConfig.id, "name", event.target.value)}
                          placeholder="Agent display name"
                        />
                      </label>
                    </div>

                    <label className="agent-config-group" htmlFor="agent-config-system-message">
                      <span className="agent-config-group-label">System Message (Persona Definition)</span>
                      <textarea
                        id="agent-config-system-message"
                        className="agent-config-input agent-config-textarea"
                        value={selectedAgentConfig.systemMessage}
                        rows={5}
                        onChange={(event) => updateAgentField(selectedAgentConfig.id, "systemMessage", event.target.value)}
                      />
                    </label>

                    <label className="agent-config-group" htmlFor="agent-config-user-message">
                      <span className="agent-config-group-label">Prompt Template (User Message)</span>
                      <textarea
                        id="agent-config-user-message"
                        className="agent-config-input agent-config-textarea"
                        value={selectedAgentConfig.userMessage}
                        rows={4}
                        onChange={(event) => updateAgentField(selectedAgentConfig.id, "userMessage", event.target.value)}
                      />
                    </label>
                  </section>

                  <section className={`agent-config-advanced-card ${isAgentAdvancedOpen ? "open" : ""}`} aria-label="Advanced model settings">
                    <button
                      type="button"
                      className="agent-config-advanced-toggle"
                      onClick={() => setIsAgentAdvancedOpen((current) => !current)}
                      aria-expanded={isAgentAdvancedOpen}
                    >
                      <span className="agent-config-advanced-title">
                        <SettingsGlyph />
                        Advanced Settings
                      </span>
                      <span className="agent-config-advanced-chevron" aria-hidden="true">
                        <ChevronGlyph expanded={isAgentAdvancedOpen} />
                      </span>
                    </button>

                    {isAgentAdvancedOpen ? (
                      <div className="agent-config-advanced-body">
                        <label className="agent-config-group" htmlFor="agent-config-provider">
                          <span className="agent-config-group-label">LLM Provider</span>
                          <select
                            id="agent-config-provider"
                            className="agent-config-input"
                            value={selectedAgentConfig.provider}
                            onChange={(event) => handleProviderChange(selectedAgentConfig.id, event.target.value as LLMProvider)}
                          >
                            {PROVIDER_OPTIONS.map((provider) => (
                              <option key={provider} value={provider}>
                                {provider}
                              </option>
                            ))}
                          </select>
                        </label>

                        <div className="agent-config-group">
                          <div className="agent-config-group-head">
                            <span className="agent-config-group-label">Temperature</span>
                            <span className="agent-config-temperature-value">{selectedAgentConfig.temperature.toFixed(1)}</span>
                          </div>
                          <div className="agent-config-temperature-control">
                            <input
                              id="agent-config-temperature"
                              type="range"
                              min={0}
                              max={1}
                              step={0.01}
                              value={selectedAgentConfig.temperature}
                              style={{ ["--agent-temp" as string]: `${Math.round(selectedAgentConfig.temperature * 100)}%` }}
                              onChange={(event) => {
                                const nextValue = Number(event.target.value);
                                updateAgentField(selectedAgentConfig.id, "temperature", nextValue);
                              }}
                            />
                            <div className="agent-config-slider-meta">
                              <span>Precise</span>
                              <span>Creative</span>
                            </div>
                          </div>
                        </div>

                        <label className="agent-config-group" htmlFor="agent-config-model">
                          <span className="agent-config-group-label">Model Selection</span>
                          <select
                            id="agent-config-model"
                            className="agent-config-input"
                            value={selectedAgentConfig.model}
                            onChange={(event) => updateAgentField(selectedAgentConfig.id, "model", event.target.value)}
                          >
                            {PROVIDER_MODEL_OPTIONS[selectedAgentConfig.provider].map((model) => (
                              <option key={model} value={model}>
                                {model}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="agent-config-group" htmlFor="agent-config-max-tokens">
                          <span className="agent-config-group-label">Max Tokens</span>
                          <input
                            id="agent-config-max-tokens"
                            type="number"
                            min={256}
                            max={8000}
                            className="agent-config-input"
                            value={selectedAgentConfig.maxTokens}
                            onChange={(event) => {
                              const nextValue = clampTokenInput(Number(event.target.value));
                              updateAgentField(selectedAgentConfig.id, "maxTokens", nextValue);
                            }}
                          />
                        </label>
                      </div>
                    ) : null}
                  </section>

                  {showAgentConfigFooter ? (
                    <section className="agent-config-editor-footer" aria-label="Agent config status and actions">
                      {showAgentConfigSyncState ? (
                        <p className={`agent-config-sync-state tone-${agentConfigSyncTone}`}>{agentConfigSyncMessage}</p>
                      ) : null}
                      {showAgentConfigActionButtons ? (
                        <div className="agent-config-sidebar-actions">
                          <button
                            type="button"
                            className="agent-config-save"
                            onClick={() => void handleSaveAgentConfigs()}
                            disabled={!agentConfigsDirty || agentConfigSyncStatus === "saving" || agentConfigSyncStatus === "loading"}
                          >
                            {agentConfigSyncStatus === "saving" ? "Saving..." : "Save changes"}
                          </button>

                          <button
                            type="button"
                            className="agent-config-reset"
                            onClick={resetAgentConfigs}
                            disabled={agentConfigSyncStatus === "saving" || agentConfigSyncStatus === "loading"}
                          >
                            Reset defaults
                          </button>
                        </div>
                      ) : null}
                    </section>
                  ) : null}
                </article>
              ) : null}
            </section>
          ) : activeTab === "editor" ? (
            <>
              <section className="boardroom-canvas" aria-label="Workflow canvas">
                <div className="canvas-inner">
                  <svg className="canvas-edges" viewBox="0 0 1900 360" preserveAspectRatio="none" aria-hidden="true">
                    <defs>
                      <marker id="workflow-arrow" markerWidth="10" markerHeight="8" refX="8" refY="4" orient="auto">
                        <path d="M0,0 L0,8 L8,4 z" fill="#94a3b8" />
                      </marker>
                    </defs>
                    {EDGES.map((edge) => {
                      const source = nodes.find((node) => node.id === edge.source);
                      const target = nodes.find((node) => node.id === edge.target);
                      if (!source || !target) {
                        return null;
                      }
                      return <EdgePath key={edge.id} start={source.position} end={target.position} />;
                    })}
                  </svg>

                  {nodes.map((node) => {
                    const expandable = hasSubtasks(node);
                    const expanded = expandable && expandedNodeId === node.id;

                    return (
                      <button
                        key={node.id}
                        type="button"
                        className={`workflow-node ${selectedNodeId === node.id ? "selected" : ""} ${expanded ? "expanded" : ""} status-${node.status.toLowerCase()}`}
                        style={{ left: node.position.x, top: node.position.y }}
                        onClick={() => handleNodeClick(node)}
                        aria-expanded={expandable ? expanded : undefined}
                      >
                        <div className="workflow-node-row">
                          <div className="workflow-glyph">
                            <NodeGlyph type={node.type} />
                          </div>
                          <div className="workflow-state">
                            {node.status === "RUNNING" ? <span className="workflow-running-dot" aria-hidden="true" /> : null}
                            {node.status === "COMPLETED" ? <span className="workflow-complete-mark">✓</span> : null}
                            <span className="workflow-status">{node.status}</span>
                          </div>
                        </div>
                        <h3>{node.title}</h3>
                        <p>{node.subtitle}</p>

                        {expandable ? (
                          <div className="workflow-expand-meta">
                            <span>{node.tasks?.length} agents</span>
                            <span className="workflow-chevron" aria-hidden="true">
                              ›
                            </span>
                          </div>
                        ) : null}

                        {expanded ? (
                          <ul className="workflow-subtasks" aria-label={`${node.title} tasks`}>
                            {node.tasks?.map((task) => (
                              <li key={task} className="workflow-subtask-chip">
                                <span className="subtask-dot" aria-hidden="true" />
                                {task}
                              </li>
                            ))}
                          </ul>
                        ) : null}

                        {node.status === "RUNNING" ? <span className="workflow-run-progress" aria-hidden="true" /> : null}
                      </button>
                    );
                  })}
                </div>
              </section>

              <aside className="boardroom-panel">
                <div className="panel-header">
                  <h2>Configuration</h2>
                  <p>Configure selected workflow node</p>
                </div>

                <div className="panel-body">
                  {selectedNode ? (
                    <>
                      <div className="selection-header">
                        <div className="workflow-glyph">
                          <NodeGlyph type={selectedNode.type} />
                        </div>
                        <div>
                          <h3>{selectedNode.title}</h3>
                          <p>Node ID: {selectedNode.id}</p>
                        </div>
                      </div>

                      {selectedNode.type === "INPUT" ? (
                        <>
                          {selectedStrategy ? (
                            <div className="input-context-card">
                              <p className="input-context-label">Active Strategy Context</p>
                              <strong>{selectedStrategy.name}</strong>
                              <span>{selectedStrategy.summary}</span>
                            </div>
                          ) : null}

                          <label className="form-control" htmlFor="decision-id-input">
                            Decision ID (optional)
                            <input
                              id="decision-id-input"
                              value={decisionId}
                              onChange={(event) => setDecisionId(event.target.value)}
                              placeholder="Leave blank to process all Proposed items"
                            />
                          </label>

                          <label
                            className={`form-checkbox-control${!tavilyConfigured ? " disabled" : ""}`}
                            htmlFor="external-research-toggle"
                          >
                            <input
                              id="external-research-toggle"
                              type="checkbox"
                              checked={tavilyConfigured ? includeExternalResearch : false}
                              disabled={!tavilyConfigured}
                              onChange={(event) => setIncludeExternalResearch(event.target.checked)}
                            />
                            <span>Use Tavily external research</span>
                          </label>
                          <p className="form-checkbox-help">
                            {tavilyConfigured
                              ? "Enabled by default. Disable to run model-only evaluation without web research."
                              : "Unavailable. Set TAVILY_API_KEY on the server to enable Tavily research."}
                          </p>
                        </>
                      ) : null}

                      {selectedNode.type === "REVIEW" ? (
                        <div className="agent-grid">
                          {(selectedNode.tasks ?? ["CEO", "CFO", "CTO", "Compliance"]).map((agent) => (
                            <div key={agent} className="agent-chip">
                              <span className="agent-indicator" aria-hidden="true">
                                <ChessPieceGlyph piece={resolveAgentChessPiece("", agent)} />
                              </span>
                              {agent}
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {selectedNode.type === "SYNTHESIS" ? (
                        <div className="score-card">
                          <p>DQS</p>
                          <strong>{result ? 87 : 0}</strong>
                          <span>/100</span>
                        </div>
                      ) : null}

                      {selectedNode.type === "PERSIST" ? (
                        <div className="sync-card">
                          <p>Target: Strategic Decision Log</p>
                          <strong>
                            {selectedNode.status === "COMPLETED"
                              ? "Synced successfully"
                              : selectedNode.status === "FAILED"
                                ? "Sync failed"
                                : "Waiting for execution"}
                          </strong>
                        </div>
                      ) : null}

                      {!["INPUT", "REVIEW", "SYNTHESIS", "PERSIST"].includes(selectedNode.type) ? (
                        <div className="panel-empty">This node runs automatically from upstream context.</div>
                      ) : null}
                    </>
                  ) : (
                    <div className="panel-placeholder">
                      <div className="placeholder-arrow" aria-hidden="true">
                        →
                      </div>
                      <h3>Select a Node</h3>
                      <p>Click on any step in the workflow canvas to view details and configuration options.</p>
                    </div>
                  )}
                </div>

                <div className="panel-logs">
                  <div className="log-header">
                    <span>System Logs</span>
                    <span className="log-status" aria-hidden="true" />
                  </div>
                  <div className="log-body">
                    {logLines.length > 0 ? (
                      logLines.map((line) => (
                        <p key={line}>
                          <span aria-hidden="true">→</span>
                          {line}
                        </p>
                      ))
                    ) : (
                      <p className="log-idle">Waiting for execution...</p>
                    )}
                  </div>
                </div>
              </aside>
            </>
          ) : (
            <section className="preview-mode">
              {activeReport && activeMetrics ? (
                <div className="report-shell">
                  {reportStates.length > 1 ? (
                    <div className="report-switcher" role="tablist" aria-label="Decision report selector">
                      {reportStates.map((state, index) => (
                        <button
                          key={state.decision_id || index}
                          type="button"
                          role="tab"
                          aria-selected={clampedPreviewIndex === index}
                          className={clampedPreviewIndex === index ? "active" : ""}
                          onClick={() => setPreviewIndex(index)}
                        >
                          {state.run_created_at
                            ? `Run ${index + 1} - ${formatRunTimestamp(state.run_created_at) || state.decision_name}`
                            : state.decision_name || `Decision ${index + 1}`}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {error ? <div className="preview-error">{error}</div> : null}

                  <article className="report-card">
                    <header className={`report-hero tone-${activeRecommendationTone ?? "challenged"}`}>
                      <div className="report-hero-main">
                        <div className="report-meta">
                          <span className="report-tag">Strategic Decision</span>
                          <span className="report-id">ID: {activeReport.decision_id.slice(0, 16)}</span>
                          {activeReport.run_created_at ? (
                            <span className="report-id">Run: {formatRunTimestamp(activeReport.run_created_at)}</span>
                          ) : null}
                        </div>
                        <h2>{activeReport.decision_name}</h2>
                        <p>{summaryLine || "Executive report generated from workflow results."}</p>
                      </div>

                      <div className="report-hero-stats">
                        <span className={`report-decision-pill tone-${activeRecommendationTone ?? "challenged"}`}>{activeRecommendation}</span>
                        <div className="report-dqs">
                          <span>DQS</span>
                          <strong>
                            {formatDqs(activeReport.dqs)}
                            <small>/10</small>
                          </strong>
                        </div>
                      </div>
                    </header>

                    <div className="report-content">
                      <div className="report-summary-grid">
                        <div className="summary-card">
                          <span>Blocked Reviews</span>
                          <strong>{blockedReviewCount}</strong>
                        </div>
                        <div className="summary-card">
                          <span>Missing Sections</span>
                          <strong>{missingSectionCount}</strong>
                        </div>
                        <div className="summary-card">
                          <span>Workflow Status</span>
                          <strong>{activeReport.status}</strong>
                        </div>
                        <div className="summary-card">
                          <span>Recommendation</span>
                          <strong>{activeRecommendation}</strong>
                        </div>
                      </div>

                      <div className="report-top-grid">
                        <section className="report-block">
                          <h3>Strategic Snapshot</h3>
                          <div className="snapshot-grid">
                            <div className="snapshot-item wide">
                              <span>Primary KPI</span>
                              <strong>{activeMetrics.primaryKpi}</strong>
                            </div>
                            <div className="snapshot-item">
                              <span>Investment</span>
                              <strong>{formatCurrency(activeMetrics.investment)}</strong>
                            </div>
                            <div className="snapshot-item">
                              <span>12M Benefit</span>
                              <strong>{formatCurrency(activeMetrics.benefit12m)}</strong>
                            </div>
                            <div className="snapshot-item">
                              <span>Risk-Adjusted ROI</span>
                              <strong>{activeMetrics.roi !== null ? `${activeMetrics.roi.toFixed(2)}x` : "N/A"}</strong>
                            </div>
                            <div className="snapshot-item">
                              <span>Probability</span>
                              <strong>{activeMetrics.probability}</strong>
                            </div>
                            <div className="snapshot-item">
                              <span>Time Horizon</span>
                              <strong>{activeMetrics.timeHorizon}</strong>
                            </div>
                            <div className="snapshot-item">
                              <span>Strategic Objective</span>
                              <strong>{activeMetrics.strategicObjective}</strong>
                            </div>
                            <div className="snapshot-item">
                              <span>Leverage Score</span>
                              <strong>{activeMetrics.leverageScore}</strong>
                            </div>
                          </div>
                        </section>

                        <section className="report-block">
                          <h3>Governance & Quality Controls</h3>
                          {activeGovernanceRows.length > 0 ? (
                            <div className="governance-grid">
                              {activeGovernanceRows.map((row) => (
                                <div key={row.label} className={`governance-row ${row.met ? "met" : "missing"}`}>
                                  <span>{row.label}</span>
                                  <strong>{row.met ? "Met" : "Missing"}</strong>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="empty-hint">Governance checks are not available in this payload.</p>
                          )}
                        </section>
                      </div>

                      <section className="report-block">
                        <h3>Executive Agent Feedback</h3>
                        {activeReviews.length > 0 ? (
                          <div className="review-grid">
                            {activeReviews.map((review) => (
                              <article key={`${review.agent}-${review.score}`} className={`review-card ${review.blocked ? "blocked" : "open"}`}>
                                <div className="review-head">
                                  <div>
                                    <h4>{review.agent}</h4>
                                    <p>Confidence: {Math.round(review.confidence * 100)}%</p>
                                  </div>
                                  <div className="review-score">
                                    {review.score}
                                    <small>/10</small>
                                  </div>
                                </div>
                                <p className="review-thesis">{review.thesis}</p>
                                {review.blockers.length > 0 ? (
                                  <div className="review-blockers">
                                    <span>Critical Blockers</span>
                                    <ul>
                                      {review.blockers.map((blocker) => (
                                        <li key={blocker}>{blocker}</li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : null}
                              </article>
                            ))}
                          </div>
                        ) : (
                          <p className="empty-hint">No review objects are available for this run.</p>
                        )}
                      </section>

                      <section className={`report-block report-synthesis tone-${activeRecommendationTone ?? "challenged"}`}>
                        <h3>Chairperson Synthesis</h3>
                        <p className="synthesis-summary">
                          {activeReport.synthesis?.executive_summary ?? "Synthesis output is not available for this run."}
                        </p>
                        <div className="synthesis-grid">
                          <div>
                            <h4>Blockers</h4>
                            {activeReport.synthesis?.blockers.length ? (
                              <ul>
                                {activeReport.synthesis.blockers.map((item) => (
                                  <li key={item}>{item}</li>
                                ))}
                              </ul>
                            ) : (
                              <p className="empty-hint">No blockers recorded.</p>
                            )}
                          </div>
                          <div>
                            <h4>Required Revisions</h4>
                            {activeReport.synthesis?.required_revisions.length ? (
                              <ol>
                                {activeReport.synthesis.required_revisions.map((item) => (
                                  <li key={item}>{item}</li>
                                ))}
                              </ol>
                            ) : (
                              <p className="empty-hint">No mandatory revisions recorded.</p>
                            )}
                          </div>
                        </div>
                      </section>

                      {activeReport.prd ? (
                        <section className="report-block">
                          <h3>PRD Briefing</h3>
                          <div className="prd-grid">
                            <article className="prd-card">
                              <h4>Scope</h4>
                              <ul>
                                {activeReport.prd.scope.map((item) => (
                                  <li key={item}>{item}</li>
                                ))}
                              </ul>
                            </article>
                            <article className="prd-card">
                              <h4>Milestones</h4>
                              <ul>
                                {activeReport.prd.milestones.map((item) => (
                                  <li key={item}>{item}</li>
                                ))}
                              </ul>
                            </article>
                            <article className="prd-card">
                              <h4>Telemetry</h4>
                              <ul>
                                {activeReport.prd.telemetry.map((item) => (
                                  <li key={item}>{item}</li>
                                ))}
                              </ul>
                            </article>
                            <article className="prd-card">
                              <h4>Risks</h4>
                              <ul>
                                {activeReport.prd.risks.map((item) => (
                                  <li key={item}>{item}</li>
                                ))}
                              </ul>
                            </article>
                          </div>
                        </section>
                      ) : null}

                      {activeReport.decision_snapshot?.excerpt ? (
                        <section className="report-block">
                          <h3>Decision Context Excerpt</h3>
                          <div className="report-excerpt">{activeReport.decision_snapshot.excerpt}</div>
                        </section>
                      ) : null}

                      <details className="report-raw">
                        <summary>Show Raw Workflow JSON</summary>
                        <pre>{JSON.stringify(activeReport.raw, null, 2)}</pre>
                      </details>
                    </div>
                  </article>
                </div>
              ) : (
                <article className="preview-card">
                  <h2>No report data generated</h2>
                  <p>Run the workflow in the editor to generate an executive-ready strategic decision report.</p>
                  {error ? <div className="preview-error">{error}</div> : null}
                  <pre>{result ? JSON.stringify(result, null, 2) : "{ }"}</pre>
                </article>
              )}
            </section>
          )}
        </section>

        <footer className="boardroom-footer">
          <div className="footer-left">
            <span>Made with ❤️ by Facundo Rodriguez</span>
          </div>
          <div className="footer-right">
            <span>
              Context: <strong>{selectedStrategy?.name ?? "No Strategy Selected"}</strong>
            </span>
          </div>
        </footer>
      </div>
    </>
  );
}
