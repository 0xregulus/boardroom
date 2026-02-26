import { useEffect, useMemo, useState } from "react";

import type { AgentConfig } from "../../../config/agent_config";
import { normalizeAgentConfigs } from "../../../config/agent_config";
import { DecisionPulse2D } from "./DecisionPulse2D";
import { GalleryActionOverlay } from "./GalleryActionOverlay";
import { PortfolioInsights } from "./PortfolioInsights";
import { RunHistorySidebar, type StrategyRunHistoryEntry } from "./RunHistorySidebar";
import { StrategyQuickLookDrawer } from "./StrategyQuickLookDrawer";
import { PlusGlyph } from "./icons";
import type { DecisionStrategy, PortfolioInsightsStatsResponse, WorkflowRunStateEntry } from "../types";
import { strategyStatusTone } from "../utils";

type SentimentFilter = "all" | "high-friction" | "pending-mitigation" | "smooth-approval" | "unclassified";
type AgentDotTone = "approved" | "blocked" | "caution" | "neutral";
type ReviewerTone = "approved" | "caution" | "blocked";
type GalleryAction = "REPORT" | "EDIT" | "RERUN";

interface StrategyListProps {
  agentConfigs: AgentConfig[];
  strategies: DecisionStrategy[];
  isLoading: boolean;
  error: string | null;
  selectedStrategyId: string | null;
  workflowRunHistoryByDecision: Record<string, WorkflowRunStateEntry[]>;
  onSelect: (strategy: DecisionStrategy) => void;
  onCreate: () => void;
  onOpenReport: (strategy: DecisionStrategy, options?: { runId?: number }) => void;
  onOpenForge: (strategy: DecisionStrategy) => void;
  onOpenRunHistory: (strategy: DecisionStrategy, options?: { runId?: number }) => void;
  onRerunPipeline: (strategy: DecisionStrategy) => void;
}

interface AgentStance {
  agent: string;
  stance: ReviewerTone;
  score: number;
  confidence: number;
}

interface PortfolioCardModel {
  strategy: DecisionStrategy;
  dqs: number;
  stances: AgentStance[];
  agentDotTones: AgentDotTone[];
  pulseInfluence: number[];
  pulsePositions: Array<[number, number, number]>;
  frictionScore: number;
  pendingMitigationsCount: number;
  riskFindingsCount: number;
  hasHighFriction: boolean;
  hasSmoothApproval: boolean;
  hasPendingMitigations: boolean;
  hasUnclassified: boolean;
  hasRun: boolean;
  missingSections: string[];
}

const FILTER_LABELS: Array<{ key: SentimentFilter; label: string }> = [
  { key: "all", label: "All Decisions" },
  { key: "high-friction", label: "High Friction" },
  { key: "pending-mitigation", label: "Pending Mitigations" },
  { key: "smooth-approval", label: "Smooth Approvals" },
  { key: "unclassified", label: "Unknown / Proposed" },
];

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function asString(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  }
  return [];
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizeLookup(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeAgentKey(agent: string, knownAgentKeys: Set<string>, aliasToKey: Map<string, string>): string {
  const normalized = normalizeLookup(agent);
  if (normalized.length === 0) {
    return "";
  }
  if (normalized.includes("red-team") || normalized.includes("redteam") || normalized.includes("pre-mortem") || normalized.includes("premortem")) {
    return "red-team";
  }
  const aliased = aliasToKey.get(normalized);
  if (aliased) {
    return aliased;
  }
  if ((normalized.includes("compliance") || normalized.includes("legal") || normalized.includes("gc")) && knownAgentKeys.has("compliance")) {
    return "compliance";
  }
  if ((normalized.includes("ceo") || normalized.includes("chief-executive")) && knownAgentKeys.has("ceo")) {
    return "ceo";
  }
  if ((normalized.includes("cfo") || normalized.includes("chief-financial")) && knownAgentKeys.has("cfo")) {
    return "cfo";
  }
  if ((normalized.includes("cto") || normalized.includes("chief-technology") || normalized.includes("chief-technical")) && knownAgentKeys.has("cto")) {
    return "cto";
  }
  if (knownAgentKeys.has(normalized)) {
    return normalized;
  }
  return "";
}

function normalizeStance(raw: unknown): AgentDotTone {
  if (typeof raw !== "string") {
    return "neutral";
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === "blocked") {
    return "blocked";
  }
  if (normalized === "caution" || normalized === "challenged") {
    return "caution";
  }
  if (normalized === "approved" || normalized === "mitigated" || normalized === "aligned") {
    return "approved";
  }
  return "neutral";
}

function parseStancesFromState(state: Record<string, unknown>): AgentStance[] {
  const summarized = Array.isArray(state.review_stances) ? state.review_stances : [];
  if (summarized.length > 0) {
    return summarized
      .map((entry) => {
        const record = asRecord(entry);
        if (!record) {
          return null;
        }
        const agent = typeof record.agent === "string" ? record.agent : "Agent";
        return {
          agent,
          stance: (normalizeStance(record.stance) === "neutral" ? "caution" : normalizeStance(record.stance)) as ReviewerTone,
          score: Math.max(0, Math.min(10, asNumber(record.score) ?? 0)),
          confidence: Math.max(0, Math.min(1, asNumber(record.confidence) ?? 0)),
        } satisfies AgentStance;
      })
      .filter((entry): entry is AgentStance => entry !== null)
      .slice(0, 12);
  }

  const reviews = asRecord(state.reviews) ?? {};
  return Object.entries(reviews)
    .map(([reviewKey, reviewValue]) => {
      const review = asRecord(reviewValue);
      if (!review) {
        return null;
      }
      const score = Math.max(0, Math.min(10, asNumber(review.score) ?? 0));
      const confidence = Math.max(0, Math.min(1, asNumber(review.confidence) ?? 0));
      const blocked = Boolean(review.blocked);
      const stance: ReviewerTone = blocked ? "blocked" : confidence < 0.65 || score < 6 ? "caution" : "approved";
      const agent = typeof review.agent === "string" && review.agent.trim().length > 0 ? review.agent : reviewKey;
      return { agent, stance, score, confidence } satisfies AgentStance;
    })
    .filter((entry): entry is AgentStance => entry !== null)
    .slice(0, 12);
}

function selectWorstTone(current: AgentDotTone, next: AgentDotTone): AgentDotTone {
  const priority: Record<AgentDotTone, number> = {
    blocked: 4,
    caution: 3,
    approved: 2,
    neutral: 1,
  };
  return priority[next] > priority[current] ? next : current;
}

function dotTonesFromStances(
  stances: AgentStance[],
  knownAgentKeys: Set<string>,
  aliasToKey: Map<string, string>,
  agentDotOrder: string[],
): AgentDotTone[] {
  const byAgent = new Map<string, AgentDotTone>();

  for (const stance of stances) {
    const key = normalizeAgentKey(stance.agent, knownAgentKeys, aliasToKey);
    if (key.length === 0 || !agentDotOrder.includes(key)) {
      continue;
    }
    const previous = byAgent.get(key) ?? "neutral";
    byAgent.set(key, selectWorstTone(previous, stance.stance));
  }

  return agentDotOrder.map((agentKey) => byAgent.get(agentKey) ?? "neutral");
}

function influenceFromDotTone(tone: AgentDotTone): number {
  if (tone === "blocked") {
    return 0.94;
  }
  if (tone === "caution") {
    return 0.64;
  }
  if (tone === "approved") {
    return 0.52;
  }
  return 0.2;
}

function buildPulseInfluence(
  agentDotTones: AgentDotTone[],
  agentDotOrder: string[],
  metrics: {
    dqs: number;
    frictionScore: number;
    pendingMitigationsCount: number;
    riskFindingsCount: number;
  },
): number[] {
  const base = agentDotTones.map((tone) => influenceFromDotTone(tone));
  const hasSignal = agentDotTones.some((tone) => tone !== "neutral");
  const dqsPressure = clamp01((100 - metrics.dqs) / 100);
  const frictionPressure = clamp01(metrics.frictionScore / 4);
  const pendingPressure = clamp01(metrics.pendingMitigationsCount / 6);
  const riskPressure = clamp01(metrics.riskFindingsCount / 8);
  const aggregatePressure = clamp01(
    frictionPressure * 0.42 + pendingPressure * 0.34 + riskPressure * 0.16 + dqsPressure * 0.08,
  );

  const values = base.slice();
  const redTeamIndex = agentDotOrder.indexOf("red-team");
  if (redTeamIndex >= 0) {
    values[redTeamIndex] = Math.max(
      values[redTeamIndex] ?? 0,
      0.24 + aggregatePressure * 0.72 + pendingPressure * 0.08,
    );
  }

  if (!hasSignal && values.length > 0) {
    values[0] = Math.max(values[0] ?? 0, 0.2 + frictionPressure * 0.58);
    if (values.length > 1) {
      values[1] = Math.max(values[1] ?? 0, 0.2 + pendingPressure * 0.56);
    }
    if (values.length > 2) {
      values[2] = Math.max(values[2] ?? 0, 0.2 + dqsPressure * 0.48);
    }
  }

  return values.map((value) => clamp01(value));
}

function buildPulsePositions(agentDotOrder: string[]): Array<[number, number, number]> {
  return agentDotOrder.map((_, index) => {
    const angle = (index / agentDotOrder.length) * Math.PI * 2 - Math.PI / 2;
    return [Math.cos(angle) * 0.95, Math.sin(angle) * 0.95, 0.35] as [number, number, number];
  });
}

function filterMatches(filter: SentimentFilter, card: PortfolioCardModel): boolean {
  if (filter === "all") {
    return true;
  }
  if (filter === "high-friction") {
    return card.hasHighFriction;
  }
  if (filter === "pending-mitigation") {
    return card.hasPendingMitigations;
  }
  if (filter === "smooth-approval") {
    return card.hasSmoothApproval;
  }
  return card.hasUnclassified;
}

function getCardClassification(card: PortfolioCardModel): "high-friction" | "pending-mitigation" | "smooth-approval" | "unclassified" {
  if (card.hasHighFriction) {
    return "high-friction";
  }
  if (card.hasPendingMitigations) {
    return "pending-mitigation";
  }
  if (card.hasSmoothApproval) {
    return "smooth-approval";
  }
  return "unclassified";
}

function buildPortfolioCard(
  strategy: DecisionStrategy,
  runs: WorkflowRunStateEntry[],
  knownAgentKeys: Set<string>,
  aliasToKey: Map<string, string>,
  agentDotOrder: string[],
): PortfolioCardModel {
  const latestRun = runs[0] ?? null;
  const state = asRecord(latestRun?.state) ?? {};

  const rawDqs = asNumber(state.dqs);
  const dqs = clampPercent(rawDqs === null ? 0 : rawDqs <= 10 ? rawDqs * 10 : rawDqs);
  const stances = parseStancesFromState(state);
  const agentDotTones = dotTonesFromStances(stances, knownAgentKeys, aliasToKey, agentDotOrder);
  const riskFindingsCount = Math.max(0, asNumber(state.risk_findings_count) ?? 0);
  const pendingMitigationsCount = Math.max(0, asNumber(state.pending_mitigations_count) ?? 0);
  const missingSections = asStringArray(state.missing_sections).slice(0, 25);
  const frictionScore =
    asNumber(state.friction_score) ??
    stances.filter((entry) => entry.stance === "blocked").length * 1.4 +
    stances.filter((entry) => entry.stance === "caution").length * 0.6 +
    pendingMitigationsCount * 0.4;

  const hasHighFriction = strategy.status === "Blocked" || frictionScore >= 1.8;
  const hasSmoothApproval =
    strategy.status === "Approved" &&
    pendingMitigationsCount === 0 &&
    stances.every((entry) => entry.stance !== "blocked" && entry.stance !== "caution") &&
    dqs >= 75;
  const hasPendingMitigations = pendingMitigationsCount > 0 || strategy.status === "In Review";
  const hasUnclassified = !hasHighFriction && !hasPendingMitigations && !hasSmoothApproval;

  const pulseInfluence = buildPulseInfluence(agentDotTones, agentDotOrder, {
    dqs,
    frictionScore,
    pendingMitigationsCount,
    riskFindingsCount,
  });

  return {
    strategy,
    dqs,
    stances,
    agentDotTones,
    pulseInfluence,
    pulsePositions: buildPulsePositions(agentDotOrder),
    frictionScore,
    pendingMitigationsCount,
    riskFindingsCount,
    hasHighFriction,
    hasSmoothApproval,
    hasPendingMitigations,
    hasUnclassified,
    hasRun: latestRun !== null,
    missingSections,
  };
}

function buildRunSummary(state: Record<string, unknown>, strategyName: string): string {
  const explicitSummary = asString(state.summary_line).trim();
  if (explicitSummary.length > 0) {
    return explicitSummary;
  }

  const missingSections = asStringArray(state.missing_sections);
  if (missingSections.length > 0) {
    return `${missingSections.length} governance gaps remained in this run (${missingSections.slice(0, 2).join(", ")}).`;
  }

  const status = asString(state.status).trim() || "PERSISTED";
  return `${strategyName} run completed with status ${status}.`;
}

function buildRunHistory(
  strategy: DecisionStrategy,
  runs: WorkflowRunStateEntry[],
  knownAgentKeys: Set<string>,
  aliasToKey: Map<string, string>,
  agentDotOrder: string[],
): StrategyRunHistoryEntry[] {
  const rows: StrategyRunHistoryEntry[] = runs.map((run) => {
    const state = asRecord(run.state) ?? {};
    const dqsRaw = asNumber(state.dqs);
    const dqs = clampPercent(dqsRaw === null ? 0 : dqsRaw <= 10 ? dqsRaw * 10 : dqsRaw);
    const stances = parseStancesFromState(state);
    const dotTones = dotTonesFromStances(stances, knownAgentKeys, aliasToKey, agentDotOrder);
    const riskFindingsCount = Math.max(0, asNumber(state.risk_findings_count) ?? 0);
    const pendingMitigationsCount = Math.max(0, asNumber(state.pending_mitigations_count) ?? 0);
    const frictionScore =
      asNumber(state.friction_score) ??
      stances.filter((entry) => entry.stance === "blocked").length * 1.4 +
      stances.filter((entry) => entry.stance === "caution").length * 0.6 +
      pendingMitigationsCount * 0.4;
    const influence = buildPulseInfluence(dotTones, agentDotOrder, {
      dqs,
      frictionScore,
      pendingMitigationsCount,
      riskFindingsCount,
    });

    return {
      id: run.id,
      timestamp: run.createdAt,
      dqs,
      summary: buildRunSummary(state, strategy.name),
      influence,
      deltaFromPrevious: null,
    };
  });

  for (let index = 0; index < rows.length; index += 1) {
    const previous = rows[index + 1];
    rows[index].deltaFromPrevious = previous ? rows[index].dqs - previous.dqs : null;
  }

  return rows;
}

export function StrategyList({
  agentConfigs,
  strategies,
  isLoading,
  error,
  selectedStrategyId,
  workflowRunHistoryByDecision,
  onSelect,
  onCreate,
  onOpenReport,
  onOpenForge,
  onOpenRunHistory,
  onRerunPipeline,
}: StrategyListProps) {
  const [filter, setFilter] = useState<SentimentFilter>("all");
  const [mode, setMode] = useState<"gallery" | "insights">("gallery");
  const [remoteInsights, setRemoteInsights] = useState<PortfolioInsightsStatsResponse | null>(null);
  const [remoteInsightsLoading, setRemoteInsightsLoading] = useState(false);
  const [remoteInsightsError, setRemoteInsightsError] = useState<string | null>(null);
  const [remoteInsightsFetched, setRemoteInsightsFetched] = useState(false);
  const [activeQuickLookStrategyId, setActiveQuickLookStrategyId] = useState<string | null>(null);
  const [activeHistoryStrategyId, setActiveHistoryStrategyId] = useState<string | null>(null);
  const [selectedRunByStrategy, setSelectedRunByStrategy] = useState<Record<string, number>>({});
  const normalizedAgentConfigs = useMemo(() => normalizeAgentConfigs(agentConfigs), [agentConfigs]);
  const knownAgentKeys = useMemo(() => new Set(normalizedAgentConfigs.map((config) => normalizeLookup(config.id))), [normalizedAgentConfigs]);
  const aliasToKey = useMemo(() => {
    const aliases = new Map<string, string>();
    for (const config of normalizedAgentConfigs) {
      const key = normalizeLookup(config.id);
      aliases.set(key, key);
      const roleAlias = normalizeLookup(config.role);
      if (roleAlias.length > 0) {
        aliases.set(roleAlias, key);
      }
      const nameAlias = normalizeLookup(config.name);
      if (nameAlias.length > 0) {
        aliases.set(nameAlias, key);
      }
    }
    return aliases;
  }, [normalizedAgentConfigs]);
  const agentDotOrder = useMemo(() => {
    const keys = normalizedAgentConfigs.map((config) => normalizeLookup(config.id));
    return [...new Set([...keys, "red-team"])];
  }, [normalizedAgentConfigs]);
  const agentLabelByKey = useMemo(() => {
    const labels = new Map<string, string>();
    for (const config of normalizedAgentConfigs) {
      const key = normalizeLookup(config.id);
      const label = config.role.trim() || config.name.trim() || config.id.toUpperCase();
      labels.set(key, label);
    }
    labels.set("red-team", "Red Team");
    return labels;
  }, [normalizedAgentConfigs]);

  const portfolioCards = useMemo(
    () =>
      strategies
        .map((strategy) =>
          buildPortfolioCard(
            strategy,
            workflowRunHistoryByDecision[strategy.id] ?? [],
            knownAgentKeys,
            aliasToKey,
            agentDotOrder,
          ),
        )
        .sort((left, right) => {
          if (left.hasRun !== right.hasRun) {
            return left.hasRun ? -1 : 1;
          }
          if (left.dqs !== right.dqs) {
            return right.dqs - left.dqs;
          }
          return left.strategy.name.localeCompare(right.strategy.name);
        }),
    [agentDotOrder, aliasToKey, knownAgentKeys, strategies, workflowRunHistoryByDecision],
  );

  const filteredCards = useMemo(() => portfolioCards.filter((card) => filterMatches(filter, card)), [filter, portfolioCards]);

  const governanceStats = useMemo(() => {
    const cardsWithRuns = portfolioCards.filter((entry) => entry.hasRun);
    const averageDqs =
      cardsWithRuns.length > 0
        ? cardsWithRuns.reduce((sum, entry) => sum + entry.dqs, 0) / cardsWithRuns.length
        : 0;

    const reviewerFriction = new Map<string, number>();
    for (const card of cardsWithRuns) {
      for (const stance of card.stances) {
        const key = normalizeAgentKey(stance.agent, knownAgentKeys, aliasToKey);
        if (key.length === 0 || !agentDotOrder.includes(key)) {
          continue;
        }
        const increment = stance.stance === "blocked" ? 2 : stance.stance === "caution" ? 1 : 0;
        reviewerFriction.set(key, (reviewerFriction.get(key) ?? 0) + increment);
      }
    }

    const topReviewer = [...reviewerFriction.entries()].sort((left, right) => right[1] - left[1])[0] ?? null;
    const topReviewerLabel = topReviewer ? agentLabelByKey.get(topReviewer[0]) ?? topReviewer[0].replace(/-/g, " ").toUpperCase() : "N/A";

    const totalFindings = cardsWithRuns.reduce((sum, entry) => sum + entry.riskFindingsCount, 0);
    const resolvedFindings = cardsWithRuns.reduce(
      (sum, entry) => sum + Math.max(0, entry.riskFindingsCount - entry.pendingMitigationsCount),
      0,
    );
    const mitigationRate = totalFindings > 0 ? (resolvedFindings / totalFindings) * 100 : 100;

    return {
      averageDqs,
      topReviewerLabel,
      topReviewerScore: topReviewer?.[1] ?? 0,
      mitigationRate,
    };
  }, [agentDotOrder, agentLabelByKey, aliasToKey, knownAgentKeys, portfolioCards]);

  const insightsEntries = useMemo(
    () =>
      portfolioCards.map((card) => ({
        strategyId: card.strategy.id,
        title: card.strategy.name,
        reviewDate: card.strategy.reviewDate,
        status: card.strategy.status,
        dqs: card.dqs,
        hasRun: card.hasRun,
        missingSections: card.missingSections,
        stances: card.stances,
        pendingMitigationsCount: card.pendingMitigationsCount,
        riskFindingsCount: card.riskFindingsCount,
        frictionScore: card.frictionScore,
        runs: (workflowRunHistoryByDecision[card.strategy.id] ?? []).map((entry) => {
          const state = asRecord(entry.state) ?? {};
          return {
            createdAt: entry.createdAt,
            pendingMitigationsCount: Math.max(0, asNumber(state.pending_mitigations_count) ?? 0),
          };
        }),
      })),
    [portfolioCards, workflowRunHistoryByDecision],
  );

  const cardByStrategyId = useMemo(
    () => new Map(portfolioCards.map((card) => [card.strategy.id, card])),
    [portfolioCards],
  );
  const strategyById = useMemo(
    () => new Map(strategies.map((strategy) => [strategy.id, strategy])),
    [strategies],
  );

  const activeQuickLookCard = activeQuickLookStrategyId ? cardByStrategyId.get(activeQuickLookStrategyId) ?? null : null;
  const activeHistoryStrategy = activeHistoryStrategyId ? strategyById.get(activeHistoryStrategyId) ?? null : null;
  const activeRunHistory = useMemo(() => {
    if (!activeHistoryStrategy) {
      return [];
    }
    const runs = workflowRunHistoryByDecision[activeHistoryStrategy.id] ?? [];
    return buildRunHistory(activeHistoryStrategy, runs, knownAgentKeys, aliasToKey, agentDotOrder);
  }, [activeHistoryStrategy, agentDotOrder, aliasToKey, knownAgentKeys, workflowRunHistoryByDecision]);
  const selectedHistoryRunId =
    activeHistoryStrategyId && selectedRunByStrategy[activeHistoryStrategyId]
      ? selectedRunByStrategy[activeHistoryStrategyId]
      : activeRunHistory[0]?.id ?? null;

  function handleGalleryAction(action: GalleryAction, strategy: DecisionStrategy): void {
    if (action === "REPORT") {
      onOpenReport(strategy);
      return;
    }
    if (action === "EDIT") {
      onOpenForge(strategy);
      return;
    }
    onRerunPipeline(strategy);
  }

  useEffect(() => {
    if (mode !== "insights" || remoteInsightsFetched || remoteInsightsLoading) {
      return;
    }

    let cancelled = false;
    const abortController = new AbortController();

    async function loadInsights(): Promise<void> {
      setRemoteInsightsLoading(true);
      setRemoteInsightsError(null);
      try {
        const response = await fetch("/api/insights/stats?windowDays=120", {
          cache: "no-store",
          signal: abortController.signal,
        });
        const json = (await response.json()) as PortfolioInsightsStatsResponse;
        if (!response.ok) {
          throw new Error(json.error || "Failed to load portfolio insights.");
        }
        if (!cancelled) {
          setRemoteInsights(json);
          setRemoteInsightsFetched(true);
        }
      } catch (insightsError) {
        const errorName = (insightsError as any)?.name;
        const errorMessage = (insightsError as any)?.message?.toLowerCase() || "";
        if (errorName === "AbortError" || errorMessage.includes("aborted")) {
          return;
        }
        if (!cancelled) {
          const message = insightsError instanceof Error ? insightsError.message : String(insightsError);
          setRemoteInsightsError(message);
          setRemoteInsightsFetched(true);
        }
      } finally {
        if (!cancelled) {
          setRemoteInsightsLoading(false);
        }
      }
    }

    void loadInsights();
    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [mode, remoteInsightsFetched, remoteInsightsLoading]);

  return (
    <section className="portfolio-gallery-shell" aria-label="Strategic portfolio">
      <div className="portfolio-gallery-header">
        <div>
          <h2>Strategic Portfolio</h2>
          <p>Boardroom snapshots of every decision, indexed by rigor, friction, and mitigation posture.</p>
        </div>
        <button type="button" className="strategy-add-button" aria-label="Add strategy" onClick={onCreate}>
          <PlusGlyph />
        </button>
      </div>

      <div className="portfolio-mode-switch" role="tablist" aria-label="Portfolio view mode">
        <button
          type="button"
          role="tab"
          className={mode === "gallery" ? "active" : ""}
          aria-selected={mode === "gallery"}
          onClick={() => setMode("gallery")}
        >
          Gallery
        </button>
        <button
          type="button"
          role="tab"
          className={mode === "insights" ? "active" : ""}
          aria-selected={mode === "insights"}
          onClick={() => setMode("insights")}
        >
          Insights
        </button>
      </div>

      <div className="portfolio-governance-stats">
        <article>
          <span>Average Decision Quality</span>
          <strong>{governanceStats.averageDqs.toFixed(1)}</strong>
        </article>
        <article>
          <span>Most Active Reviewer</span>
          <strong>{governanceStats.topReviewerLabel}</strong>
          <small>{governanceStats.topReviewerScore} critical interventions</small>
        </article>
        <article>
          <span>Risk Mitigation Rate</span>
          <strong>{governanceStats.mitigationRate.toFixed(0)}%</strong>
        </article>
      </div>

      {mode === "gallery" ? (
        <div className="portfolio-filter-bar" role="tablist" aria-label="Strategic sentiment filters">
          {FILTER_LABELS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              role="tab"
              className={filter === entry.key ? "active" : ""}
              aria-selected={filter === entry.key}
              onClick={() => setFilter(entry.key)}
            >
              {entry.label}
            </button>
          ))}
        </div>
      ) : null}

      {isLoading ? <p className="strategy-list-state">Loading strategies from Strategic Decision Log...</p> : null}
      {!isLoading && error ? <p className="strategy-list-state error">{error}</p> : null}
      {!isLoading && !error && strategies.length === 0 ? (
        <p className="strategy-list-state">No strategies found in the Strategic Decision Log.</p>
      ) : null}

      {!isLoading && !error && mode === "gallery" ? (
        <div className={`portfolio-gallery-workbench ${activeQuickLookCard || activeHistoryStrategy ? "with-drawer" : ""}`}>
          <div className="strategy-gallery-grid" aria-label="Decision card gallery">
            {filteredCards.map((card) => {
              const strategy = card.strategy;
              const active = selectedStrategyId === strategy.id;
              const tone = strategyStatusTone(strategy.status);

              return (
                <article
                  key={strategy.id}
                  className={`strategy-gallery-card ${active ? "selected" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(strategy)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(strategy);
                    }
                  }}
                >
                  <div className="strategy-gallery-card-content">
                    <div className="strategy-gallery-card-top">
                      <div className="strategy-gallery-pulse-thumb" aria-hidden="true">
                        <DecisionPulse2D
                          dqs={card.dqs}
                          runtimeActive={false}
                          isStatic={true}
                          stable={false}
                          classification={
                            filter === "all" || filter === "unclassified"
                              ? getCardClassification(card)
                              : undefined
                          }
                          agentInfluence={card.pulseInfluence}
                          agentPositions={card.pulsePositions}
                        />
                      </div>
                      <div className="strategy-gallery-dqs">
                        <strong>{Math.round(card.dqs)}</strong>
                        <span>DQS</span>
                      </div>
                    </div>

                    <div className="strategy-gallery-card-head">
                      <h3>{strategy.name}</h3>
                      <span className={`strategy-status tone-${tone}`}>{strategy.status}</span>
                    </div>

                    <p className="strategy-gallery-meta">
                      <span>{strategy.owner}</span>
                      <span>{strategy.reviewDate}</span>
                    </p>

                    <div className="strategy-gallery-agent-dots" aria-label="Agent consensus mini-map">
                      {card.agentDotTones.map((stance, index) => (
                        <span key={`${strategy.id}-dot-${index}`} className={`dot tone-${stance}`} />
                      ))}
                    </div>

                    <div className="strategy-gallery-signals">
                      <span className={card.hasHighFriction ? "alert" : "neutral"}>
                        Friction {card.frictionScore.toFixed(1)}
                      </span>
                      <span className={card.hasPendingMitigations ? "alert" : "ok"}>
                        Pending {card.pendingMitigationsCount}
                      </span>
                    </div>
                  </div>

                  <GalleryActionOverlay onAction={(action) => handleGalleryAction(action, strategy)} />
                </article>
              );
            })}

            {!isLoading && !error && filteredCards.length === 0 ? (
              <p className="strategy-list-state">No decisions match this strategic sentiment filter.</p>
            ) : null}
          </div>

          {activeQuickLookCard ? (
            <StrategyQuickLookDrawer
              strategy={activeQuickLookCard.strategy}
              dqs={activeQuickLookCard.dqs}
              pulseInfluence={activeQuickLookCard.pulseInfluence}
              pulsePositions={activeQuickLookCard.pulsePositions}
              runCount={(workflowRunHistoryByDecision[activeQuickLookCard.strategy.id] ?? []).length}
              onClose={() => setActiveQuickLookStrategyId(null)}
              onOpenReport={() => onOpenReport(activeQuickLookCard.strategy)}
              onOpenForge={() => onOpenForge(activeQuickLookCard.strategy)}
              onOpenHistory={() => onOpenRunHistory(activeQuickLookCard.strategy)}
              onRerun={() => onRerunPipeline(activeQuickLookCard.strategy)}
            />
          ) : null}

          {activeHistoryStrategy ? (
            <RunHistorySidebar
              strategyTitle={activeHistoryStrategy.name}
              runHistory={activeRunHistory}
              selectedRunId={selectedHistoryRunId}
              onClose={() => setActiveHistoryStrategyId(null)}
              onSelectRun={(runId) => {
                setSelectedRunByStrategy((prev) => ({ ...prev, [activeHistoryStrategy.id]: runId }));
                onOpenReport(activeHistoryStrategy, { runId });
              }}
              onOpenReport={(runId) => onOpenReport(activeHistoryStrategy, { runId })}
            />
          ) : null}
        </div>
      ) : null}

      {!isLoading && !error && mode === "insights" ? (
        <PortfolioInsights entries={insightsEntries} onOpenStrategy={(strategyId) => {
          const matched = strategies.find((entry) => entry.id === strategyId);
          if (matched) {
            onSelect(matched);
          }
        }} agentConfigs={normalizedAgentConfigs} remoteStats={remoteInsights} remoteLoading={remoteInsightsLoading} remoteError={remoteInsightsError} />
      ) : null}
    </section>
  );
}
