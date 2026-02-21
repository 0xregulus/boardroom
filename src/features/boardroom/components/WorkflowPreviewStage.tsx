import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ApiResult, ReportReview, ReportWorkflowState, SnapshotMetrics } from "../types";
import { formatRunTimestamp } from "../utils";
import { buildAuditEntries, clampPercent } from "./workflowPreviewStage.helpers";
import { DecisionPulse2D } from "./DecisionPulse2D";

interface WorkflowPreviewStageProps {
  activeReport: ReportWorkflowState | null;
  activeMetrics: SnapshotMetrics | null;
  reportStates: ReportWorkflowState[];
  clampedPreviewIndex: number;
  error: string | null;
  result: ApiResult | null;
  activeRecommendation: "Approved" | "Challenged" | "Blocked" | null;
  activeRecommendationTone: "approved" | "challenged" | "blocked" | null;
  summaryLine: string;
  blockedReviewCount: number;
  missingSectionCount: number;
  activeGovernanceRows: Array<{ label: string; met: boolean }>;
  activeReviews: ReportReview[];
  logLines: string[];
  onPreviewIndexChange: (index: number) => void;
}

type ConsensusTone = "approved" | "caution" | "blocked" | "mitigated";

type IntegrityStatus = "RESOLVED" | "OPEN";

interface ConsensusRow {
  id: string;
  agent: string;
  stance: string;
  tone: ConsensusTone;
  insight: string;
}

interface IntegrityProofRow {
  id: string;
  riskFound: string;
  mitigation: string;
  status: IntegrityStatus;
  tone: "resolved" | "open";
  verifier: string;
  severity: number;
}

interface HistoryRow {
  id: string;
  title: string;
  dqs: number;
  dateLabel: string;
  influence: number[];
  summary: string;
  deltaFromPrevious: number | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9\s]+/g, " ").replace(/\s+/g, " ");
}

function formatMetadataTimestamp(value: string | undefined): string {
  if (!value) {
    return "Timestamp unavailable";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Timestamp unavailable";
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const hour = String(parsed.getHours()).padStart(2, "0");
  const minute = String(parsed.getMinutes()).padStart(2, "0");
  const second = String(parsed.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} | ${hour}:${minute}:${second}`;
}

function parseClockToSeconds(value: string): number | null {
  const match = value.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return null;
  }

  return hours * 3600 + minutes * 60 + seconds;
}

function deriveDebateDurationSeconds(
  auditEntries: Array<{ timestamp: string | null }>,
  interactionRoundCount: number,
  reviewCount: number,
): number | null {
  const timeline = auditEntries
    .map((entry) => parseClockToSeconds(entry.timestamp ?? ""))
    .filter((entry): entry is number => entry !== null);

  if (timeline.length >= 2) {
    const first = timeline[0];
    const last = timeline[timeline.length - 1];
    const raw = last >= first ? last - first : last + 86_400 - first;
    if (raw > 0) {
      return raw;
    }
  }

  if (interactionRoundCount > 0) {
    return interactionRoundCount * 12.4;
  }
  if (reviewCount > 0) {
    return reviewCount * 6.8;
  }

  return null;
}

function buildExecutionId(decisionId: string, runId?: number): string {
  const normalized = `${decisionId}:${runId ?? "NA"}`;
  let hash = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash * 33 + normalized.charCodeAt(index)) % 46_656; // 36^3
  }
  const suffix = hash.toString(36).toUpperCase().padStart(3, "0").slice(-2);
  const runSegment = typeof runId === "number" && Number.isFinite(runId) ? String(runId).padStart(3, "0").slice(-3) : "000";
  return `BR-${runSegment}-${suffix}`;
}

const AGENT_ORDER_MAP = ["ceo", "cfo", "cto", "coo", "cmo", "chro", "compliance", "red-team"] as const;

function buildPulsePositions(): Array<[number, number, number]> {
  return AGENT_ORDER_MAP.map((_, index) => {
    const angle = (index / AGENT_ORDER_MAP.length) * Math.PI * 2 - Math.PI / 2;
    return [Math.cos(angle) * 0.95, Math.sin(angle) * 0.95, 0.35] as [number, number, number];
  });
}

function isRedTeamAgent(agent: string): boolean {
  return /red team|pre-mortem|premortem|resource competitor|counter|adversarial/i.test(agent);
}

function formatRunHistoryDelta(delta: number | null): string {
  if (delta === null || !Number.isFinite(delta)) {
    return "Baseline run";
  }
  const rounded = Math.round(delta);
  if (rounded === 0) {
    return "No DQS delta";
  }
  return `${rounded > 0 ? "+" : ""}${rounded} DQS vs prior run`;
}

function displayAgentName(agent: string): string {
  const normalized = agent.trim().toLowerCase();
  if (normalized.includes("ceo")) {
    return "CEO";
  }
  if (normalized.includes("cfo")) {
    return "CFO";
  }
  if (normalized.includes("cto")) {
    return "CTO";
  }
  if (normalized.includes("compliance")) {
    return "Compliance";
  }
  if (isRedTeamAgent(normalized)) {
    return "Red Team";
  }
  if (normalized.length === 0) {
    return "Reviewer";
  }

  return agent
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .filter((chunk) => chunk.length > 0)
    .map((chunk) => chunk[0].toUpperCase() + chunk.slice(1).toLowerCase())
    .join(" ");
}

function summarizePriorityInsight(review: ReportReview): string {
  const thesis = review.thesis.trim();
  return (
    review.blockers.find((entry) => entry.trim().length > 0) ??
    review.required_changes.find((entry) => entry.trim().length > 0) ??
    review.approval_conditions.find((entry) => entry.trim().length > 0) ??
    review.risks.find((risk) => risk.evidence.trim().length > 0)?.evidence ??
    (thesis.length > 0 ? thesis : "No priority insight captured for this reviewer.")
  );
}

function extractExecutingModel(activeReport: ReportWorkflowState, activeReviews: ReportReview[]): string {
  const rawRecord = asRecord(activeReport.raw);
  const directKeys = ["model", "modelName", "executing_model", "executingModel", "workflow_model"];
  for (const key of directKeys) {
    const value = rawRecord?.[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  const userContext = asRecord(rawRecord?.user_context);
  const contextKeys = ["model", "modelName", "defaultModel", "chairpersonModel"];
  for (const key of contextKeys) {
    const value = userContext?.[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  const agentConfigs = Array.isArray(userContext?.agentConfigs)
    ? userContext.agentConfigs
    : Array.isArray(rawRecord?.agentConfigs)
      ? rawRecord.agentConfigs
      : [];

  const discoveredModels = new Set<string>();
  for (const config of agentConfigs) {
    const record = asRecord(config);
    const model = record?.model;
    if (typeof model === "string" && model.trim().length > 0) {
      discoveredModels.add(model.trim());
    }
  }

  if (discoveredModels.size === 1) {
    return [...discoveredModels][0];
  }
  if (discoveredModels.size > 1) {
    return "Multi-model governance runtime";
  }

  if (activeReviews.length >= 6) {
    return "Boardroom multi-agent runtime";
  }

  return "Unspecified";
}

function resolveConsensusTone(review: ReportReview): { stance: string; tone: ConsensusTone } {
  const uncertain = review.confidence < 0.65 || review.score < 6;
  if (review.blocked) {
    return { stance: "Blocked", tone: "blocked" };
  }
  if (isRedTeamAgent(review.agent)) {
    return { stance: "Mitigated", tone: "mitigated" };
  }
  if (uncertain || review.blockers.length > 0) {
    return { stance: "Caution", tone: "caution" };
  }
  return { stance: "Approved", tone: "approved" };
}

function buildIntegrityProofRows(activeReport: ReportWorkflowState, activeReviews: ReportReview[]): IntegrityProofRow[] {
  const residualRiskTokens = new Set(
    (activeReport.synthesis?.residual_risks ?? [])
      .map((entry) => normalizeToken(entry))
      .filter((entry) => entry.length > 0),
  );

  const rows: IntegrityProofRow[] = [];

  activeReviews.forEach((review, reviewIndex) => {
    review.risks.forEach((risk, riskIndex) => {
      const riskHeadline = risk.type.trim() || `Risk ${riskIndex + 1}`;
      const evidence = risk.evidence.trim();
      const riskFound = evidence.length > 0 ? `${riskHeadline}: ${evidence}` : riskHeadline;
      const normalizedRisk = normalizeToken(riskFound);
      const residualMatch = [...residualRiskTokens].some((token) => normalizedRisk.includes(token) || token.includes(normalizedRisk));
      const isOpen = review.blocked || residualMatch;

      rows.push({
        id: `${review.agent}-${reviewIndex}-${riskIndex}`,
        riskFound,
        mitigation:
          review.required_changes.find((entry) => entry.trim().length > 0) ??
          review.approval_conditions.find((entry) => entry.trim().length > 0) ??
          (isOpen
            ? "Mitigation not accepted yet. Define owner, trigger, and rollback plan before board sign-off."
            : "Mitigation accepted during executive review and embedded in controls."),
        status: isOpen ? "OPEN" : "RESOLVED",
        tone: isOpen ? "open" : "resolved",
        verifier: isOpen ? "Pending board closure" : "Verified by Compliance Agent",
        severity: Number.isFinite(risk.severity) ? risk.severity : 0,
      });
    });
  });

  (activeReport.synthesis?.residual_risks ?? []).forEach((residual, index) => {
    const normalizedResidual = normalizeToken(residual);
    if (normalizedResidual.length === 0) {
      return;
    }

    const alreadyCovered = rows.some((row) => normalizeToken(row.riskFound).includes(normalizedResidual));
    if (alreadyCovered) {
      return;
    }

    rows.push({
      id: `residual-${index}`,
      riskFound: residual,
      mitigation: "Residual risk remains open. Add explicit contingency funding and owner accountability.",
      status: "OPEN",
      tone: "open",
      verifier: "Pending board closure",
      severity: 10,
    });
  });

  if (rows.length === 0) {
    rows.push({
      id: "fallback-proof",
      riskFound: "No explicit critical risks were logged by reviewers in this run.",
      mitigation: "Run Red Team mode to force adversarial pre-mortem checks before final submission.",
      status: "RESOLVED",
      tone: "resolved",
      verifier: "Governance fallback",
      severity: 0,
    });
  }

  return rows
    .sort((left, right) => {
      if (left.status !== right.status) {
        return left.status === "OPEN" ? -1 : 1;
      }
      return right.severity - left.severity;
    })
    .slice(0, 6);
}

export function WorkflowPreviewStage({
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
  onPreviewIndexChange,
}: WorkflowPreviewStageProps) {
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const shareFeedbackTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (shareFeedbackTimerRef.current !== null) {
        window.clearTimeout(shareFeedbackTimerRef.current);
      }
    },
    [],
  );

  const liveAuditEntries = buildAuditEntries(logLines);
  const fallbackAuditEntries =
    activeReport !== null
      ? buildAuditEntries([
        `Pipeline loaded for ${activeReport.decision_name}`,
        `Evaluated ${Object.keys(activeReport.reviews).length} executive review(s)`,
        `Computed DQS ${(activeReport.dqs * 10).toFixed(1)} / 100`,
        `Recommendation: ${activeRecommendation ?? "Pending"}`,
      ])
      : [];
  const auditEntries = liveAuditEntries.length > 0 ? liveAuditEntries : fallbackAuditEntries;

  const dqsPercent = clampPercent((activeReport?.dqs ?? 0) * 10);
  const substancePercent = clampPercent((activeReport?.substance_score ?? 0) * 10);
  const hygienePercent = clampPercent((activeReport?.hygiene_score ?? 0) * 10);
  const decisionStatus = activeRecommendation ?? activeReport?.synthesis?.final_recommendation ?? "Challenged";
  const decisionTone = (activeRecommendationTone ?? decisionStatus.toLowerCase()) as "approved" | "challenged" | "blocked";

  const gaugeRadius = 110;
  const gaugeCircumference = 2 * Math.PI * gaugeRadius;
  const gaugeSweepRatio = 0.7;
  const gaugeSweep = gaugeCircumference * gaugeSweepRatio;
  const gaugeGap = gaugeCircumference - gaugeSweep;
  const gaugeTrackDasharray = `${gaugeSweep} ${gaugeGap}`;
  const gaugeFill = (gaugeSweep * dqsPercent) / 100;
  const gaugeFillDasharray = `${gaugeFill} ${gaugeCircumference}`;
  const gaugeTone = dqsPercent >= 75 ? "healthy" : dqsPercent >= 50 ? "watch" : "critical";

  const consensusRows = useMemo<ConsensusRow[]>(
    () =>
      activeReviews.map((review, index) => {
        const tone = resolveConsensusTone(review);
        return {
          id: `${review.agent}-${index}`,
          agent: displayAgentName(review.agent),
          stance: tone.stance,
          tone: tone.tone,
          insight: summarizePriorityInsight(review),
        };
      }),
    [activeReviews],
  );

  const integrityRows = useMemo(() => (activeReport ? buildIntegrityProofRows(activeReport, activeReviews) : []), [activeReport, activeReviews]);

  const unresolvedIntegrityCount = useMemo(
    () => integrityRows.filter((entry) => entry.status === "OPEN").length,
    [integrityRows],
  );
  const interactionRoundCount = activeReport?.interaction_rounds?.length ?? 0;
  const debateDurationSeconds = useMemo(
    () => deriveDebateDurationSeconds(auditEntries, interactionRoundCount, activeReviews.length),
    [activeReviews.length, auditEntries, interactionRoundCount],
  );
  const debateDurationLabel = debateDurationSeconds !== null ? `Executed in ${debateDurationSeconds.toFixed(1)}s` : "";

  const decisionDate = activeReport?.run_created_at ? formatRunTimestamp(activeReport.run_created_at) : "Unavailable";
  const decisionTimestamp = formatMetadataTimestamp(activeReport?.run_created_at);
  const auditId = activeReport
    ? activeReport.run_id
      ? `AUD-${String(activeReport.run_id).padStart(5, "0")}`
      : `AUD-${activeReport.decision_id.slice(0, 8).toUpperCase()}`
    : "AUD-UNAVAILABLE";
  const executionId = activeReport ? buildExecutionId(activeReport.decision_id, activeReport.run_id) : "BR-000-00";

  const executingModel = activeReport ? extractExecutingModel(activeReport, activeReviews) : "Unspecified";

  const governanceHighlights = useMemo(() => {
    if (activeGovernanceRows.length === 0) {
      return [];
    }

    return activeGovernanceRows
      .slice(0, 3)
      .map((row) => (row.met ? `${row.label}: passed` : `${row.label}: requires follow-up`));
  }, [activeGovernanceRows]);

  const consensusGreenCount = useMemo(
    () => consensusRows.filter((entry) => entry.tone === "approved" || entry.tone === "mitigated").length,
    [consensusRows],
  );
  const consensusTotal = consensusRows.length;
  const consensusRedCount = consensusTotal - consensusGreenCount;
  const consensusGreenPercent = consensusTotal > 0 ? (consensusGreenCount / consensusTotal) * 100 : 0;
  const consensusRedPercent = consensusTotal > 0 ? (consensusRedCount / consensusTotal) * 100 : 0;

  const leadDissenter = useMemo(() => {
    if (activeReviews.length === 0) {
      return null;
    }

    const averageScore = activeReviews.reduce((sum, review) => sum + review.score, 0) / activeReviews.length;
    const lowest = [...activeReviews].sort((left, right) => left.score - right.score)[0];
    const isMaterialFriction = lowest.blocked || averageScore - lowest.score >= 1.2;
    if (!isMaterialFriction) {
      return null;
    }

    return {
      agent: displayAgentName(lowest.agent),
      reason: summarizePriorityInsight(lowest),
      score: lowest.score,
      avg: averageScore,
    };
  }, [activeReviews]);

  const activePulseInfluence = useMemo(() => {
    if (activeReviews.length === 0) {
      return [0.28, 0.26, 0.24, 0.22, 0.2];
    }

    const tones = activeReviews.map((review) => {
      const { tone } = resolveConsensusTone(review);
      if (tone === "blocked") return 0.94;
      if (tone === "caution") return 0.64;
      if (tone === "approved") return 0.52;
      return 0.2;
    });

    return [...tones, 0.28, 0.26, 0.24, 0.22].slice(0, 12);
  }, [activeReviews]);

  const pulsePositions = useMemo(() => buildPulsePositions(), []);

  const historyRows = useMemo<HistoryRow[]>(
    () =>
      reportStates.map((state, index) => {
        const dqsScore = Math.round(clampPercent(state.dqs * 10));
        let deltaFromPrevious: number | null = null;

        if (index + 1 < reportStates.length) {
          const priorState = reportStates[index + 1];
          const priorDqs = Math.round(clampPercent(priorState.dqs * 10));
          deltaFromPrevious = dqsScore - priorDqs;
        }

        const influence = Object.values(state.reviews).map((r) => r.score);
        const summary = state.synthesis?.executive_summary || state.decision_name;

        return {
          id: state.run_id ? `run-${state.run_id}` : `${state.decision_id}-${index}`,
          title: state.decision_name,
          dqs: dqsScore,
          dateLabel: state.run_created_at ? formatMetadataTimestamp(state.run_created_at) : "Timestamp unavailable",
          influence,
          summary,
          deltaFromPrevious,
        };
      }),
    [reportStates],
  );

  const setShareMessage = useCallback((message: string) => {
    setShareFeedback(message);
    if (shareFeedbackTimerRef.current !== null) {
      window.clearTimeout(shareFeedbackTimerRef.current);
    }
    shareFeedbackTimerRef.current = window.setTimeout(() => {
      setShareFeedback(null);
    }, 2400);
  }, []);

  const handleGeneratePdf = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.print();
    setShareMessage("Print dialog opened.");
  }, [setShareMessage]);

  const handleCopyPermanentLink = useCallback(async () => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareMessage("Permanent link copied.");
    } catch {
      setShareMessage("Unable to copy link.");
    }
  }, [setShareMessage]);

  return (
    <section className="preview-mode report-v3-mode">
      {activeReport && activeMetrics ? (
        <div className="briefing-shell">

          {error ? <div className="preview-error">{error}</div> : null}

          <div className="executive-brief-grid">
            <article className={`briefing-card decision-stamp-card tone-${decisionTone}`}>
              <header>
                <span className={`briefing-status tone-${decisionTone}`}>{decisionStatus.toUpperCase()}</span>
              </header>
              <div className="decision-receipt-pill" aria-label="Execution metadata">
                <span>{decisionTimestamp}</span>
                <span>{executionId}</span>
                <span>{debateDurationLabel}</span>
              </div>

              <div className="decision-stamp-layout">
                <div className="decision-stamp-seal-wrap" aria-label="Final stable nucleus seal">
                  <div className="decision-stamp-seal" aria-hidden="true">
                    <DecisionPulse2D
                      dqs={dqsPercent}
                      agentInfluence={activePulseInfluence}
                      agentPositions={pulsePositions}
                      isStatic={true}
                      stable={true}
                    />
                  </div>
                  <div className={`decision-stamp-dqs tone-${gaugeTone}`}>
                    <strong>{Math.round(dqsPercent)}</strong>
                    <span>DQS</span>
                  </div>
                </div>

                <div className="decision-stamp-copy">
                  <h2>{activeReport.decision_name}</h2>
                  <p>{summaryLine || activeReport.synthesis?.executive_summary || "No executive summary generated."}</p>
                  <dl className="decision-stamp-metadata">
                    <div>
                      <dt>Date of Decision</dt>
                      <dd>{decisionDate}</dd>
                    </div>
                    <div>
                      <dt>Executing Agent Model</dt>
                      <dd>{executingModel}</dd>
                    </div>
                    <div>
                      <dt>Audit ID</dt>
                      <dd>{auditId}</dd>
                    </div>
                  </dl>
                  <div className="decision-share-row">
                    <button type="button" onClick={handleGeneratePdf}>
                      Generate PDF
                    </button>
                    <button type="button" onClick={handleCopyPermanentLink}>
                      Permanent Link
                    </button>
                    {shareFeedback ? <span>{shareFeedback}</span> : null}
                  </div>
                </div>
              </div>
            </article>

            <article className="briefing-card consensus-matrix-card">
              <header>
                <span className="briefing-kicker">Consensus & Conflict Matrix</span>
                <span className="matrix-summary">{consensusRows.length} agent perspectives</span>
              </header>
              <div className="consensus-meter-panel">
                <div className="consensus-meter-head">
                  <span>Consensus vs Friction</span>
                  <strong>
                    {consensusGreenCount} Green · {consensusRedCount} Red
                  </strong>
                </div>
                <div className="consensus-meter" role="img" aria-label="Consensus versus friction meter">
                  <span className="green" style={{ width: `${consensusGreenPercent}%` }} />
                  <span className="red" style={{ width: `${consensusRedPercent}%` }} />
                </div>
              </div>

              {leadDissenter ? (
                <article className="lead-dissenter-card">
                  <h4>Critical Friction Point</h4>
                  <p>
                    <strong>{leadDissenter.agent}</strong> scored this decision at {leadDissenter.score.toFixed(1)} vs board average{" "}
                    {leadDissenter.avg.toFixed(1)}.
                  </p>
                  <p>{leadDissenter.reason}</p>
                </article>
              ) : null}

              <table className="consensus-matrix-table">
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>Stance</th>
                    <th>Priority Insight</th>
                  </tr>
                </thead>
                <tbody>
                  {consensusRows.length > 0 ? (
                    consensusRows.map((row) => (
                      <tr key={row.id}>
                        <td>{row.agent}</td>
                        <td>
                          <span className={`stance-pill tone-${row.tone}`}>{row.stance}</span>
                        </td>
                        <td>{row.insight}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="matrix-empty">
                        No reviewer outputs found for this run.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </article>

            <article className="briefing-card integrity-proof-card">
              <header>
                <span className="briefing-kicker">Integrity Proof (Red Team Audit)</span>
                <span className={`integrity-count tone-${unresolvedIntegrityCount > 0 ? "open" : "resolved"}`}>
                  {unresolvedIntegrityCount > 0 ? `${unresolvedIntegrityCount} open` : "All closed"}
                </span>
              </header>

              <div className="integrity-proof-list">
                {integrityRows.map((entry) => (
                  <article key={entry.id} className={`integrity-proof-item tone-${entry.tone}`}>
                    <p>
                      <strong>Risk Found:</strong> {entry.riskFound}
                    </p>
                    <p>
                      <strong>Mitigation Strategy:</strong> {entry.mitigation}
                    </p>
                    <p>
                      <strong>Status:</strong> <span className={`integrity-status tone-${entry.tone}`}>{entry.status}</span> ({entry.verifier})
                    </p>
                  </article>
                ))}
              </div>
            </article>

            <article className="briefing-card executive-metrics-card">
              <header>
                <span className="briefing-kicker">Mathematical Rigor Snapshot</span>
              </header>

              <div className="executive-metrics-grid">
                <article>
                  <span>Substance</span>
                  <strong>{Math.round(substancePercent)}</strong>
                </article>
                <article>
                  <span>Hygiene</span>
                  <strong>{Math.round(hygienePercent)}</strong>
                </article>
                <article>
                  <span>Blocked Reviews</span>
                  <strong>{blockedReviewCount}</strong>
                </article>
                <article>
                  <span>Missing Sections</span>
                  <strong>{missingSectionCount}</strong>
                </article>
              </div>

              {governanceHighlights.length > 0 ? (
                <ul className="executive-governance-highlights">
                  {governanceHighlights.map((entry) => (
                    <li key={entry}>{entry}</li>
                  ))}
                </ul>
              ) : null}

              <div className="report-v3-gauge compact">
                <svg viewBox="0 0 280 280" aria-hidden="true">
                  <circle className="report-v3-gauge-track" cx="140" cy="140" r={gaugeRadius} strokeDasharray={gaugeTrackDasharray} />
                  <circle
                    className={`report-v3-gauge-fill tone-${gaugeTone}`}
                    cx="140"
                    cy="140"
                    r={gaugeRadius}
                    strokeDasharray={gaugeFillDasharray}
                    strokeDashoffset={0}
                  />
                </svg>
                <div className={`report-v3-gauge-value tone-${gaugeTone}`}>
                  <strong>{dqsPercent.toFixed(1)}</strong>
                  <span>/ 100.0 DQS</span>
                </div>
              </div>
            </article>

            <article className="briefing-card audit-trace-card">
              <header>
                <span className="briefing-kicker">Audit Trace</span>
              </header>
              <div className="briefing-feed-list">
                {auditEntries.length > 0 ? (
                  auditEntries.slice(-10).map((entry) => (
                    <p key={entry.id}>
                      <span>{entry.timestamp ?? "--:--:--"}</span>
                      <strong>[{entry.type.replace("_", " ")}]</strong>
                      {entry.message}
                    </p>
                  ))
                ) : (
                  <p className="empty-hint">No trace events captured for this run.</p>
                )}
              </div>
            </article>

            {historyRows.length > 1 ? (
              <article className="briefing-card decision-history-card">
                <header>
                  <span className="briefing-kicker">Decision History</span>
                </header>
                <div className="run-history-track">
                  {historyRows.map((row, index) => {
                    const isActive = clampedPreviewIndex === index;
                    return (
                      <article key={row.id} className={`run-history-item ${isActive ? "active" : ""}`}>
                        <span className={`run-history-dot ${index === 0 ? "latest" : ""}`} aria-hidden="true" />
                        <button
                          type="button"
                          className="run-history-card"
                          onClick={() => onPreviewIndexChange(index)}
                        >
                          <div className="run-history-card-head">
                            <strong>Run #{historyRows.length - index}</strong>
                            <p>{row.dateLabel}</p>
                          </div>
                          <div className="run-history-dqs-large">{row.dqs}%</div>
                          <div className="run-history-stamp" aria-hidden="true">
                            <DecisionPulse2D
                              dqs={row.dqs}
                              agentInfluence={row.influence}
                              agentPositions={pulsePositions}
                              isStatic={true}
                            />
                          </div>
                          <div className="run-history-copy-wrap">
                            <p className="run-history-delta">{formatRunHistoryDelta(row.deltaFromPrevious)}</p>
                            <p className="run-history-summary">{row.summary}</p>
                            <span className="run-history-report-link">Time Machine: Preview this report snapshot</span>
                          </div>
                        </button>
                      </article>
                    );
                  })}
                </div>
              </article>
            ) : null}
          </div>
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
  );
}
