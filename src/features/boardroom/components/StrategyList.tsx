import { useEffect, useMemo, useState } from "react";

import { DecisionPulse2D } from "./DecisionPulse2D";
import { GalleryActionOverlay } from "./GalleryActionOverlay";
import { PortfolioInsights } from "./PortfolioInsights";
import { RunHistorySidebar, type StrategyRunHistoryEntry } from "./RunHistorySidebar";
import { StrategyQuickLookDrawer } from "./StrategyQuickLookDrawer";
import { PlusGlyph } from "./icons";
import type { DecisionStrategy, PortfolioInsightsStatsResponse, WorkflowRunStateEntry } from "../types";
import { strategyStatusTone } from "../utils";

type SentimentFilter = "all" | "high-friction" | "pending-mitigations" | "smooth-approvals";
type AgentDotTone = "approved" | "blocked" | "caution" | "neutral";
type ReviewerTone = "approved" | "caution" | "blocked";
type GalleryAction = "REPORT" | "EDIT" | "RERUN";

interface StrategyListProps {
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
  hasRun: boolean;
  missingSections: string[];
}

const AGENT_DOT_ORDER = ["ceo", "cfo", "cto", "coo", "cmo", "chro", "compliance", "red-team"] as const;
const FILTER_LABELS: Array<{ key: SentimentFilter; label: string }> = [
  { key: "all", label: "All Decisions" },
  { key: "high-friction", label: "High Friction" },
  { key: "pending-mitigations", label: "Pending Mitigations" },
  { key: "smooth-approvals", label: "Smooth Approvals" },
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

function normalizeAgentKey(agent: string): string {
  const normalized = agent.trim().toLowerCase();
  if (normalized.includes("red") || normalized.includes("pre-mortem") || normalized.includes("premortem")) {
    return "red-team";
  }
  if (normalized.includes("compliance") || normalized.includes("legal") || normalized.includes("gc")) {
    return "compliance";
  }
  if (normalized.includes("ceo")) {
    return "ceo";
  }
  if (normalized.includes("cfo")) {
    return "cfo";
  }
  if (normalized.includes("cto")) {
    return "cto";
  }
  if (normalized.includes("coo")) {
    return "coo";
  }
  if (normalized.includes("cmo")) {
    return "cmo";
  }
  if (normalized.includes("chro") || normalized.includes("people")) {
    return "chro";
  }
  return normalized.replace(/\s+/g, "-");
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

function dotTonesFromStances(stances: AgentStance[]): AgentDotTone[] {
  const byAgent = new Map<string, AgentDotTone>();

  for (const stance of stances) {
    const key = normalizeAgentKey(stance.agent);
    const previous = byAgent.get(key) ?? "neutral";
    byAgent.set(key, selectWorstTone(previous, stance.stance));
  }

  return AGENT_DOT_ORDER.map((agentKey) => byAgent.get(agentKey) ?? "neutral");
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

function buildPulsePositions(): Array<[number, number, number]> {
  return AGENT_DOT_ORDER.map((_, index) => {
    const angle = (index / AGENT_DOT_ORDER.length) * Math.PI * 2 - Math.PI / 2;
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
  if (filter === "smooth-approvals") {
    return card.hasSmoothApproval;
  }
  return card.hasPendingMitigations;
}

function buildPortfolioCard(strategy: DecisionStrategy, runs: WorkflowRunStateEntry[]): PortfolioCardModel {
  const latestRun = runs[0] ?? null;
  const state = asRecord(latestRun?.state) ?? {};

  const rawDqs = asNumber(state.dqs);
  const fallbackDqs = strategy.status === "Approved" ? 82 : strategy.status === "Blocked" ? 34 : strategy.status === "In Review" ? 58 : 50;
  const dqs = clampPercent(rawDqs === null ? fallbackDqs : rawDqs <= 10 ? rawDqs * 10 : rawDqs);
  const stances = parseStancesFromState(state);
  const agentDotTones = dotTonesFromStances(stances);
  const riskFindingsCount = Math.max(0, asNumber(state.risk_findings_count) ?? 0);
  const pendingMitigationsCount = Math.max(0, asNumber(state.pending_mitigations_count) ?? 0);
  const missingSections = asStringArray(state.missing_sections).slice(0, 25);
  const frictionScore =
    asNumber(state.friction_score) ??
    stances.filter((entry) => entry.stance === "blocked").length * 1.4 +
    stances.filter((entry) => entry.stance === "caution").length * 0.6 +
    pendingMitigationsCount * 0.4;

  const hasHighFriction = frictionScore >= 1.8 || stances.some((entry) => entry.stance === "blocked");
  const hasSmoothApproval =
    strategy.status === "Approved" &&
    pendingMitigationsCount === 0 &&
    stances.every((entry) => entry.stance !== "blocked" && entry.stance !== "caution") &&
    dqs >= 75;
  const hasPendingMitigations = pendingMitigationsCount > 0 || strategy.status === "In Review";

  const pulseInfluence = [
    ...agentDotTones.map((tone) => influenceFromDotTone(tone)),
    0.28,
    0.26,
    0.24,
    0.22,
  ].slice(0, 12);

  return {
    strategy,
    dqs,
    stances,
    agentDotTones,
    pulseInfluence,
    pulsePositions: buildPulsePositions(),
    frictionScore,
    pendingMitigationsCount,
    riskFindingsCount,
    hasHighFriction,
    hasSmoothApproval,
    hasPendingMitigations,
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

function buildRunHistory(strategy: DecisionStrategy, runs: WorkflowRunStateEntry[]): StrategyRunHistoryEntry[] {
  const rows: StrategyRunHistoryEntry[] = runs.map((run) => {
    const state = asRecord(run.state) ?? {};
    const dqsRaw = asNumber(state.dqs);
    const dqs = clampPercent(dqsRaw === null ? 0 : dqsRaw <= 10 ? dqsRaw * 10 : dqsRaw);
    const stances = parseStancesFromState(state);
    const dotTones = dotTonesFromStances(stances);
    const influence = [...dotTones.map((tone) => influenceFromDotTone(tone)), 0.28, 0.24, 0.22, 0.2].slice(0, 12);

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

  const portfolioCards = useMemo(
    () =>
      strategies
        .map((strategy) => buildPortfolioCard(strategy, workflowRunHistoryByDecision[strategy.id] ?? []))
        .sort((left, right) => {
          if (left.hasRun !== right.hasRun) {
            return left.hasRun ? -1 : 1;
          }
          if (left.dqs !== right.dqs) {
            return right.dqs - left.dqs;
          }
          return left.strategy.name.localeCompare(right.strategy.name);
        }),
    [strategies, workflowRunHistoryByDecision],
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
        const key = normalizeAgentKey(stance.agent);
        const increment = stance.stance === "blocked" ? 2 : stance.stance === "caution" ? 1 : 0;
        reviewerFriction.set(key, (reviewerFriction.get(key) ?? 0) + increment);
      }
    }

    const topReviewer = [...reviewerFriction.entries()].sort((left, right) => right[1] - left[1])[0] ?? null;
    const topReviewerLabel = topReviewer ? topReviewer[0].replace(/-/g, " ").toUpperCase() : "N/A";

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
  }, [portfolioCards]);

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
    return buildRunHistory(activeHistoryStrategy, runs);
  }, [activeHistoryStrategy, workflowRunHistoryByDecision]);
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
  }, [mode]);

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
          Portfolio Gallery
        </button>
        <button
          type="button"
          role="tab"
          className={mode === "insights" ? "active" : ""}
          aria-selected={mode === "insights"}
          onClick={() => setMode("insights")}
        >
          Portfolio Insights
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
                            filter === "all"
                              ? card.hasHighFriction
                                ? "high-friction"
                                : card.hasPendingMitigations
                                  ? "pending-mitigation"
                                  : card.hasSmoothApproval
                                    ? "smooth-approval"
                                    : undefined
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
        }} remoteStats={remoteInsights} remoteLoading={remoteInsightsLoading} remoteError={remoteInsightsError} />
      ) : null}
    </section>
  );
}
