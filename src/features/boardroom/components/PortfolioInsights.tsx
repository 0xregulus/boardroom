import { useMemo } from "react";

import type { PortfolioInsightsStatsResponse } from "../types";
import { DecisionPulse2D } from "./DecisionPulse2D";

type ReviewerTone = "approved" | "caution" | "blocked";
type PillarKey = "viability" | "integrity" | "feasibility" | "compliance" | "red-team";
type PillarTone = "healthy" | "warning" | "critical";

interface PortfolioInsightsRun {
  createdAt: string;
  pendingMitigationsCount: number;
}

interface PortfolioInsightsStance {
  agent: string;
  stance: ReviewerTone;
  score: number;
  confidence: number;
}

export interface PortfolioInsightsEntry {
  strategyId: string;
  title: string;
  reviewDate: string;
  status: string;
  dqs: number;
  hasRun: boolean;
  missingSections: string[];
  stances: PortfolioInsightsStance[];
  pendingMitigationsCount: number;
  riskFindingsCount: number;
  frictionScore: number;
  runs: PortfolioInsightsRun[];
}

interface PortfolioInsightsProps {
  entries: PortfolioInsightsEntry[];
  onOpenStrategy: (strategyId: string) => void;
  remoteStats?: PortfolioInsightsStatsResponse | null;
  remoteLoading?: boolean;
  remoteError?: string | null;
}

interface PillarHeatCell {
  key: PillarKey;
  label: string;
  weaknessRate: number;
  tone: PillarTone;
  signalCount: number;
}

interface RadarAxisMetric {
  key: string;
  label: string;
  averageScore: number;
  normalized: number;
  friction: number;
  count: number;
}

interface VelocityMetric {
  averageHours: number;
  medianHours: number;
  resolutionRate: number;
  trendPercent: number | null;
  unresolvedDecisions: number;
  events: Array<{ strategyId: string; hours: number; resolvedAt: string }>;
}

type RemoteRadarEntry = NonNullable<PortfolioInsightsStatsResponse["radar"]>[number];

const RADAR_AXES = [
  { key: "ceo", label: "CEO" },
  { key: "cfo", label: "CFO" },
  { key: "cto", label: "CTO" },
  { key: "coo", label: "COO" },
  { key: "cmo", label: "CMO" },
  { key: "chro", label: "CHRO" },
  { key: "compliance", label: "Compliance" },
  { key: "red-team", label: "Red Team" },
] as const;

const PILLAR_LABELS: Record<PillarKey, string> = {
  viability: "Viability",
  integrity: "Integrity",
  feasibility: "Feasibility",
  compliance: "Compliance",
  "red-team": "Red-Team",
};

const AGENT_TO_PILLAR: Record<string, PillarKey> = {
  ceo: "viability",
  cfo: "integrity",
  cto: "feasibility",
  coo: "feasibility",
  cmo: "viability",
  chro: "feasibility",
  compliance: "compliance",
  "red-team": "red-team",
};

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
  if (normalized.includes("ceo")) return "ceo";
  if (normalized.includes("cfo")) return "cfo";
  if (normalized.includes("cto")) return "cto";
  if (normalized.includes("coo")) return "coo";
  if (normalized.includes("cmo")) return "cmo";
  if (normalized.includes("chro") || normalized.includes("people")) return "chro";
  return normalized.replace(/\s+/g, "-");
}

function inferPillarsFromGap(gap: string): PillarKey[] {
  const lowered = gap.toLowerCase();
  const matches = new Set<PillarKey>();

  if (
    lowered.includes("objective") ||
    lowered.includes("vision") ||
    lowered.includes("market") ||
    lowered.includes("customer") ||
    lowered.includes("problem")
  ) {
    matches.add("viability");
  }
  if (
    lowered.includes("capital") ||
    lowered.includes("roi") ||
    lowered.includes("econom") ||
    lowered.includes("cac") ||
    lowered.includes("assumption") ||
    lowered.includes("cost")
  ) {
    matches.add("integrity");
  }
  if (
    lowered.includes("feasib") ||
    lowered.includes("timeline") ||
    lowered.includes("integration") ||
    lowered.includes("capacity") ||
    lowered.includes("resourc") ||
    lowered.includes("delivery")
  ) {
    matches.add("feasibility");
  }
  if (
    lowered.includes("compliance") ||
    lowered.includes("privacy") ||
    lowered.includes("regulator") ||
    lowered.includes("legal") ||
    lowered.includes("security")
  ) {
    matches.add("compliance");
  }
  if (
    lowered.includes("risk") ||
    lowered.includes("mitigation") ||
    lowered.includes("red-team") ||
    lowered.includes("blast radius") ||
    lowered.includes("reversion") ||
    lowered.includes("downside")
  ) {
    matches.add("red-team");
  }

  if (matches.size === 0) {
    matches.add("viability");
  }
  return [...matches];
}

function toPillarTone(weaknessRate: number): PillarTone {
  if (weaknessRate >= 70) {
    return "critical";
  }
  if (weaknessRate >= 45) {
    return "warning";
  }
  return "healthy";
}

function buildHeatmap(entries: PortfolioInsightsEntry[]): PillarHeatCell[] {
  const cardsWithRuns = entries.filter((entry) => entry.hasRun);
  const decisionCount = Math.max(1, cardsWithRuns.length);
  const signals: Record<PillarKey, number> = {
    viability: 0,
    integrity: 0,
    feasibility: 0,
    compliance: 0,
    "red-team": 0,
  };

  for (const entry of cardsWithRuns) {
    for (const gap of entry.missingSections) {
      for (const pillar of inferPillarsFromGap(gap)) {
        signals[pillar] += 1;
      }
    }

    for (const stance of entry.stances) {
      const agentKey = normalizeAgentKey(stance.agent);
      const pillar = AGENT_TO_PILLAR[agentKey];
      if (!pillar || stance.stance === "approved") {
        continue;
      }
      signals[pillar] += stance.stance === "blocked" ? 1 : 0.6;
    }

    if (entry.pendingMitigationsCount > 0) {
      signals["red-team"] += Math.min(2, entry.pendingMitigationsCount * 0.8);
    }
  }

  return buildHeatmapFromSignals(signals, decisionCount);
}

function buildHeatmapFromSignals(signals: Record<PillarKey, number>, decisionCount: number): PillarHeatCell[] {
  return (Object.keys(PILLAR_LABELS) as PillarKey[]).map((pillarKey) => {
    const weaknessRate = clampPercent((signals[pillarKey] / (Math.max(1, decisionCount) * 1.5)) * 100);
    return {
      key: pillarKey,
      label: PILLAR_LABELS[pillarKey],
      weaknessRate,
      tone: toPillarTone(weaknessRate),
      signalCount: Math.round(signals[pillarKey]),
    };
  });
}

function buildHeatmapFromBlindspots(
  blindspots: NonNullable<PortfolioInsightsStatsResponse["blindspots"]>,
  decisionCount: number,
): PillarHeatCell[] {
  const signals: Record<PillarKey, number> = {
    viability: 0,
    integrity: 0,
    feasibility: 0,
    compliance: 0,
    "red-team": 0,
  };

  for (const entry of blindspots) {
    for (const pillar of inferPillarsFromGap(entry.gap_category)) {
      signals[pillar] += Math.max(0, entry.frequency);
    }
  }

  return buildHeatmapFromSignals(signals, decisionCount);
}

function buildRadar(entries: PortfolioInsightsEntry[]): {
  axes: RadarAxisMetric[];
  hardest: RadarAxisMetric | null;
  strategyExecutionGap: number;
} {
  const accumulator = new Map<string, { sum: number; count: number; friction: number }>();

  for (const axis of RADAR_AXES) {
    accumulator.set(axis.key, { sum: 0, count: 0, friction: 0 });
  }

  for (const entry of entries) {
    for (const stance of entry.stances) {
      const key = normalizeAgentKey(stance.agent);
      const bucket = accumulator.get(key);
      if (!bucket) {
        continue;
      }
      bucket.sum += Math.max(0, Math.min(10, stance.score));
      bucket.count += 1;
      bucket.friction += stance.stance === "blocked" ? 2 : stance.stance === "caution" ? 1 : 0;
    }
  }

  const axes = RADAR_AXES.map((axis) => {
    const bucket = accumulator.get(axis.key) ?? { sum: 0, count: 0, friction: 0 };
    const averageScore = bucket.count > 0 ? bucket.sum / bucket.count : 6.6;
    return {
      key: axis.key,
      label: axis.label,
      averageScore,
      normalized: Math.max(0.05, Math.min(1, averageScore / 10)),
      friction: bucket.friction,
      count: bucket.count,
    };
  });

  return finalizeRadar(axes);
}

function buildRadarFromRemote(radar: NonNullable<PortfolioInsightsStatsResponse["radar"]>): {
  axes: RadarAxisMetric[];
  hardest: RadarAxisMetric | null;
  strategyExecutionGap: number;
} {
  const byKey = new Map<string, RemoteRadarEntry>();
  for (const row of radar) {
    byKey.set(normalizeAgentKey(row.agent_name), row);
  }

  const axes = RADAR_AXES.map((axis) => {
    const row = byKey.get(axis.key);
    const averageScore = row ? Math.max(0, Math.min(10, row.avg_sentiment)) : 6.6;
    const friction = row ? row.total_vetos : 0;
    const count = row ? row.total_reviews : 0;
    return {
      key: axis.key,
      label: axis.label,
      averageScore,
      normalized: Math.max(0.05, Math.min(1, averageScore / 10)),
      friction,
      count,
    };
  });

  return finalizeRadar(axes);
}

function finalizeRadar(axes: RadarAxisMetric[]): {
  axes: RadarAxisMetric[];
  hardest: RadarAxisMetric | null;
  strategyExecutionGap: number;
} {
  const hardest = axes
    .filter((axis) => axis.count > 0)
    .sort((left, right) => left.averageScore - right.averageScore)[0] ?? null;

  const ceoScore = axes.find((axis) => axis.key === "ceo")?.averageScore ?? 0;
  const ctoScore = axes.find((axis) => axis.key === "cto")?.averageScore ?? 0;
  const strategyExecutionGap = ceoScore - ctoScore;

  return { axes, hardest, strategyExecutionGap };
}

function buildRadarPolygonPoints(axes: RadarAxisMetric[], radius: number, center: number): string {
  return axes
    .map((axis, index) => {
      const angle = (index / axes.length) * Math.PI * 2 - Math.PI / 2;
      const pointRadius = radius * axis.normalized;
      const x = center + Math.cos(angle) * pointRadius;
      const y = center + Math.sin(angle) * pointRadius;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function buildGridPolygon(level: number, pointCount: number, radius: number, center: number): string {
  return Array.from({ length: pointCount }, (_, index) => {
    const angle = (index / pointCount) * Math.PI * 2 - Math.PI / 2;
    const x = center + Math.cos(angle) * radius * level;
    const y = center + Math.sin(angle) * radius * level;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function toHours(start: string, end: string): number | null {
  const startTime = Date.parse(start);
  const endTime = Date.parse(end);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime < startTime) {
    return null;
  }
  return (endTime - startTime) / 3_600_000;
}

function buildVelocity(entries: PortfolioInsightsEntry[]): VelocityMetric {
  const events: Array<{ strategyId: string; hours: number; resolvedAt: string }> = [];
  let riskyDecisions = 0;
  let unresolvedDecisions = 0;

  for (const entry of entries) {
    const runs = [...entry.runs].sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
    if (runs.length === 0) {
      continue;
    }

    const firstRiskRun = runs.find((run) => run.pendingMitigationsCount > 0);
    if (!firstRiskRun) {
      continue;
    }
    riskyDecisions += 1;

    const resolutionRun = runs.find(
      (run) => Date.parse(run.createdAt) > Date.parse(firstRiskRun.createdAt) && run.pendingMitigationsCount === 0,
    );

    if (!resolutionRun) {
      unresolvedDecisions += 1;
      continue;
    }

    const hours = toHours(firstRiskRun.createdAt, resolutionRun.createdAt);
    if (hours === null) {
      continue;
    }
    events.push({ strategyId: entry.strategyId, hours, resolvedAt: resolutionRun.createdAt });
  }

  return finalizeVelocity(events, unresolvedDecisions, riskyDecisions);
}

function buildVelocityFromRemote(
  remoteVelocity: NonNullable<PortfolioInsightsStatsResponse["mitigation_velocity"]>,
): VelocityMetric {
  const events = remoteVelocity.resolved.map((entry) => ({
    strategyId: entry.strategy_id,
    hours: Math.max(0, entry.minutes_to_mitigate / 60),
    resolvedAt: entry.resolved_at,
  }));
  const riskyDecisions = events.length + Math.max(0, remoteVelocity.unresolved_count);
  return finalizeVelocity(events, Math.max(0, remoteVelocity.unresolved_count), riskyDecisions, remoteVelocity.trend_percent_30d);
}

function finalizeVelocity(
  events: Array<{ strategyId: string; hours: number; resolvedAt: string }>,
  unresolvedDecisions: number,
  riskyDecisions: number,
  trendOverride: number | null | undefined = undefined,
): VelocityMetric {
  const durations = events.map((entry) => entry.hours);
  const averageHours = durations.length > 0 ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 0;
  const sorted = [...durations].sort((left, right) => left - right);
  const medianHours =
    sorted.length === 0
      ? 0
      : sorted.length % 2 === 1
        ? sorted[(sorted.length - 1) / 2]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;

  const now = Date.now();
  const dayMs = 86_400_000;
  const recentEvents = events.filter((entry) => now - Date.parse(entry.resolvedAt) <= 30 * dayMs);
  const previousEvents = events.filter((entry) => {
    const age = now - Date.parse(entry.resolvedAt);
    return age > 30 * dayMs && age <= 60 * dayMs;
  });
  const recentAvg =
    recentEvents.length > 0 ? recentEvents.reduce((sum, entry) => sum + entry.hours, 0) / recentEvents.length : null;
  const previousAvg =
    previousEvents.length > 0 ? previousEvents.reduce((sum, entry) => sum + entry.hours, 0) / previousEvents.length : null;
  const computedTrend =
    recentAvg !== null && previousAvg !== null && previousAvg > 0 ? ((previousAvg - recentAvg) / previousAvg) * 100 : null;
  const trendPercent = trendOverride === undefined ? computedTrend : trendOverride;
  const resolutionRate = riskyDecisions > 0 ? (events.length / riskyDecisions) * 100 : 100;

  return {
    averageHours,
    medianHours,
    resolutionRate,
    trendPercent,
    unresolvedDecisions,
    events,
  };
}

function formatSignedPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "N/A";
  }
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

export function PortfolioInsights({
  entries,
  onOpenStrategy,
  remoteStats = null,
  remoteLoading = false,
  remoteError = null,
}: PortfolioInsightsProps) {
  const entriesWithRuns = useMemo(() => entries.filter((entry) => entry.hasRun), [entries]);
  const localGlobalDqs = useMemo(() => {
    if (entriesWithRuns.length === 0) {
      return 0;
    }
    const total = entriesWithRuns.reduce((sum, entry) => sum + entry.dqs, 0);
    return total / entriesWithRuns.length;
  }, [entriesWithRuns]);

  const globalDqs = remoteStats?.summary?.avg_portfolio_dqs ?? localGlobalDqs;
  const boardMeetingsCount = remoteStats?.summary?.total_runs_considered ?? entriesWithRuns.length;

  const heatmap = useMemo(() => {
    if (remoteStats?.blindspots && remoteStats.blindspots.length > 0) {
      const decisionCount = remoteStats.summary?.total_decisions_made ?? entriesWithRuns.length;
      return buildHeatmapFromBlindspots(remoteStats.blindspots, decisionCount);
    }
    return buildHeatmap(entries);
  }, [entries, entriesWithRuns.length, remoteStats]);

  const heatmapTop = useMemo(
    () => [...heatmap].sort((left, right) => right.weaknessRate - left.weaknessRate)[0] ?? null,
    [heatmap],
  );

  const { axes, hardest, strategyExecutionGap } = useMemo(() => {
    if (remoteStats?.radar && remoteStats.radar.length > 0) {
      return buildRadarFromRemote(remoteStats.radar);
    }
    return buildRadar(entries);
  }, [entries, remoteStats]);

  const velocity = useMemo(() => {
    if (remoteStats?.mitigation_velocity) {
      return buildVelocityFromRemote(remoteStats.mitigation_velocity);
    }
    return buildVelocity(entries);
  }, [entries, remoteStats]);

  const frictionWatchlist = useMemo(
    () => [...entriesWithRuns].sort((left, right) => right.frictionScore - left.frictionScore).slice(0, 3),
    [entriesWithRuns],
  );

  const radarRadius = 98;
  const radarCenter = 120;
  const radarPoints = buildRadarPolygonPoints(axes, radarRadius, radarCenter);
  const sparkEvents = [...velocity.events].slice(-10);
  const sparkMax = Math.max(1, ...sparkEvents.map((event) => event.hours));

  return (
    <section className="portfolio-insights" aria-label="Portfolio insights dashboard">
      {remoteLoading ? <p className="portfolio-insight-empty">Refreshing insights from Strategic Memory...</p> : null}
      {remoteError ? <p className="portfolio-insight-empty">Insights API unavailable: {remoteError}</p> : null}

      <div className="portfolio-insights-top-grid">
        <article className="portfolio-insight-card portfolio-insight-global">
          <span>Global Governance Indicator</span>
          <div className="portfolio-insight-global-pulse">
            <DecisionPulse2D dqs={globalDqs} isStatic={true} stable={true} />
          </div>
          <strong>{Math.round(globalDqs)}%</strong>
          <p>Average portfolio DQS across {boardMeetingsCount} board meetings.</p>
        </article>

        <div className="portfolio-insight-highlights">
          <article className="portfolio-insight-card">
            <h3>Strategic Blindspot</h3>
            <p>
              {heatmapTop
                ? `${heatmapTop.label} weak in ${Math.round(heatmapTop.weaknessRate)}% of decision drafts.`
                : "No systemic blindspot detected yet."}
            </p>
            <small>
              Recommendation:{" "}
              {heatmapTop?.key === "integrity"
                ? "Add conservative and base-case ROI assumptions before board review."
                : heatmapTop?.key === "feasibility"
                  ? "Pre-validate delivery constraints and integration risk with engineering leadership."
                  : heatmapTop?.key === "compliance"
                    ? "Attach regulatory/privacy evidence before final submission."
                    : heatmapTop?.key === "red-team"
                      ? "Resolve Red Team findings with explicit mitigation owners and deadlines."
                      : "Ground vision claims with quantified market and customer context."}
            </small>
          </article>
          <article className="portfolio-insight-card">
            <h3>Reviewer Friction</h3>
            <p>
              {hardest
                ? `${hardest.label} is currently the toughest critic at ${hardest.averageScore.toFixed(1)}/10 average score.`
                : "Reviewer sentiment is still stabilizing; run more sessions for confidence."}
            </p>
            <small>
              {strategyExecutionGap >= 1.5
                ? "Observation: strategy-execution gap detected between CEO optimism and CTO confidence."
                : "Observation: reviewer alignment is relatively balanced across the portfolio."}
            </small>
          </article>
          <article className="portfolio-insight-card">
            <h3>Red Team Efficiency</h3>
            <p>
              Avg risk-to-resolution time: {velocity.averageHours.toFixed(1)}h. Resolution rate {Math.round(velocity.resolutionRate)}%.
            </p>
            <small>
              {velocity.trendPercent !== null
                ? `Trend vs previous 30 days: ${formatSignedPercent(velocity.trendPercent)}.`
                : "Need additional historical windows to compute month-over-month trend."}
            </small>
          </article>
        </div>
      </div>

      <div className="portfolio-insights-panel-grid">
        <article className="portfolio-insight-panel">
          <div className="portfolio-insight-panel-head">
            <h3>Governance Heatmap</h3>
            <p>Weakness concentration across the five strategic pillars.</p>
          </div>
          <div className="governance-heatmap-grid">
            {heatmap.map((cell) => (
              <div key={cell.key} className={`governance-heatmap-cell tone-${cell.tone}`}>
                <h4>{cell.label}</h4>
                <strong>{Math.round(cell.weaknessRate)}%</strong>
                <small>{cell.signalCount} weakness signals detected</small>
              </div>
            ))}
          </div>
        </article>

        <article className="portfolio-insight-panel">
          <div className="portfolio-insight-panel-head">
            <h3>Reviewer Sentiment Radar</h3>
            <p>Average final reviewer score across your portfolio.</p>
          </div>
          <div className="reviewer-radar">
            <svg viewBox="0 0 240 240" role="img" aria-label="Reviewer sentiment radar chart">
              <g>
                {[0.25, 0.5, 0.75, 1].map((level) => (
                  <polygon
                    key={`grid-${level}`}
                    points={buildGridPolygon(level, axes.length, radarRadius, radarCenter)}
                    fill="none"
                    stroke="rgba(148, 163, 184, 0.38)"
                    strokeWidth="1"
                  />
                ))}
                {axes.map((axis, index) => {
                  const angle = (index / axes.length) * Math.PI * 2 - Math.PI / 2;
                  const x = radarCenter + Math.cos(angle) * radarRadius;
                  const y = radarCenter + Math.sin(angle) * radarRadius;
                  const lx = radarCenter + Math.cos(angle) * (radarRadius + 18);
                  const ly = radarCenter + Math.sin(angle) * (radarRadius + 18);
                  return (
                    <g key={`axis-${axis.key}`}>
                      <line
                        x1={radarCenter}
                        y1={radarCenter}
                        x2={x}
                        y2={y}
                        stroke="rgba(148, 163, 184, 0.45)"
                        strokeWidth="1"
                      />
                      <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle">
                        {axis.label}
                      </text>
                    </g>
                  );
                })}
                <polygon points={radarPoints} fill="rgba(37, 99, 235, 0.2)" stroke="#2563eb" strokeWidth="2" />
                {axes.map((axis, index) => {
                  const angle = (index / axes.length) * Math.PI * 2 - Math.PI / 2;
                  const pointRadius = radarRadius * axis.normalized;
                  const x = radarCenter + Math.cos(angle) * pointRadius;
                  const y = radarCenter + Math.sin(angle) * pointRadius;
                  return <circle key={`point-${axis.key}`} cx={x} cy={y} r="3.5" fill="#1d4ed8" />;
                })}
              </g>
            </svg>
            <ul className="reviewer-radar-legend">
              {axes.map((axis) => (
                <li key={`legend-${axis.key}`}>
                  <span>{axis.label}</span>
                  <strong>{axis.averageScore.toFixed(1)}</strong>
                </li>
              ))}
            </ul>
          </div>
        </article>

        <article className="portfolio-insight-panel">
          <div className="portfolio-insight-panel-head">
            <h3>Risk Mitigation Velocity</h3>
            <p>Time-to-resolution for Red Team findings across workflow runs.</p>
          </div>
          <div className="mitigation-velocity-metrics">
            <div>
              <span>Average</span>
              <strong>{velocity.averageHours.toFixed(1)}h</strong>
            </div>
            <div>
              <span>Median</span>
              <strong>{velocity.medianHours.toFixed(1)}h</strong>
            </div>
            <div>
              <span>Unresolved</span>
              <strong>{velocity.unresolvedDecisions}</strong>
            </div>
          </div>
          <div className="mitigation-velocity-chart" role="img" aria-label="Risk mitigation velocity bars">
            {sparkEvents.length > 0 ? (
              sparkEvents.map((event, index) => (
                <button
                  key={`${event.strategyId}-${event.resolvedAt}-${index}`}
                  type="button"
                  className="velocity-bar"
                  style={{ height: `${22 + (event.hours / sparkMax) * 66}px` }}
                  onClick={() => onOpenStrategy(event.strategyId)}
                  aria-label={`Open strategy ${event.strategyId} resolved in ${event.hours.toFixed(1)} hours`}
                  title={`${event.hours.toFixed(1)}h to resolve`}
                />
              ))
            ) : (
              <p className="portfolio-insight-empty">No completed mitigation cycles yet.</p>
            )}
          </div>
          <p className="mitigation-velocity-footnote">
            Trend (30d): <strong>{formatSignedPercent(velocity.trendPercent)}</strong>
          </p>
        </article>
      </div>

      <article className="portfolio-insight-panel watchlist-panel">
        <div className="portfolio-insight-panel-head">
          <h3>High Friction Watchlist</h3>
          <p>Decisions with the highest unresolved governance tension.</p>
        </div>
        {frictionWatchlist.length > 0 ? (
          <div className="watchlist-grid">
            {frictionWatchlist.map((entry) => (
              <button
                key={`watch-${entry.strategyId}`}
                type="button"
                className="watchlist-row"
                onClick={() => onOpenStrategy(entry.strategyId)}
              >
                <div>
                  <h4>{entry.title}</h4>
                  <p>{entry.reviewDate}</p>
                </div>
                <div className="watchlist-signal">
                  <strong>{entry.frictionScore.toFixed(1)}</strong>
                  <span>friction</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="portfolio-insight-empty">No high-friction runs detected in this portfolio window.</p>
        )}
      </article>
    </section>
  );
}
