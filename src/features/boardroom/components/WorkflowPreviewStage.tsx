import { useMemo } from "react";

import type { ApiResult, ReportReview, ReportWorkflowState, SnapshotMetrics } from "../types";
import { formatRunTimestamp } from "../utils";

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

type AuditEntryType = "PIPELINE_EXEC" | "AGENT_REASONING" | "NEGOTIATION";

interface AuditEntry {
  id: string;
  lineNumber: string;
  type: AuditEntryType;
  timestamp: string | null;
  message: string;
}

const EMPTY_DECISION_ANCESTRY: ReportWorkflowState["decision_ancestry"] = [];
const EMPTY_HYGIENE_FINDINGS: ReportWorkflowState["hygiene_findings"] = [];

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function inferAuditEntryType(message: string): AuditEntryType {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("cross-agent") ||
    normalized.includes("rebuttal") ||
    normalized.includes("negotiation") ||
    normalized.includes("mediating")
  ) {
    return "NEGOTIATION";
  }

  if (
    normalized.includes("review") ||
    normalized.includes("[agent") ||
    normalized.includes("red team") ||
    normalized.includes("executive")
  ) {
    return "AGENT_REASONING";
  }

  return "PIPELINE_EXEC";
}

function buildAuditEntries(logLines: string[]): AuditEntry[] {
  return logLines.map((line, index) => {
    const match = line.match(/^(\d{1,2}:\d{2}:\d{2})\s{2,}(.*)$/);
    const timestamp = match?.[1] ?? null;
    const message = (match?.[2] ?? line).trim();

    return {
      id: `${index}-${line}`,
      lineNumber: String(index + 1).padStart(3, "0"),
      type: inferAuditEntryType(message),
      timestamp,
      message,
    };
  });
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, value));
}

function formatAgentSummaryLabel(agent: string, fallbackIndex: number): string {
  const normalized = agent.trim().toLowerCase();
  if (normalized.includes("ceo")) {
    return "CEO VISION";
  }
  if (normalized.includes("cfo")) {
    return "CFO MARGIN";
  }
  if (normalized.includes("cto")) {
    return "CTO TECH";
  }
  if (normalized.includes("pre-mortem")) {
    return "PRE-MORTEM";
  }
  if (normalized.includes("resource competitor")) {
    return "RESOURCE RIVAL";
  }
  if (normalized.includes("compliance")) {
    return "COMPLIANCE";
  }
  return `${agent.trim().toUpperCase() || `REVIEW ${fallbackIndex + 1}`}`;
}

function extractChairpersonCitations(activeReport: ReportWorkflowState): string[] {
  const synthesisCitations = Array.isArray(activeReport.synthesis?.evidence_citations)
    ? activeReport.synthesis.evidence_citations
    : [];
  if (synthesisCitations.length > 0) {
    return synthesisCitations
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .slice(0, 6);
  }

  const raw = asRecord(activeReport.raw);
  if (!raw || !Array.isArray(raw.chairperson_evidence_citations)) {
    return [];
  }

  return raw.chairperson_evidence_citations
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .slice(0, 6);
}

function citationText(citation: string): string {
  return citation.replace(/^\[[^\]]+\]\s*/, "");
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

  const decisionAncestry = activeReport?.decision_ancestry ?? EMPTY_DECISION_ANCESTRY;
  const hygieneFindings = activeReport?.hygiene_findings ?? EMPTY_HYGIENE_FINDINGS;
  const citations = useMemo(() => (activeReport ? extractChairpersonCitations(activeReport) : []), [activeReport]);

  const dqsPercent = clampPercent((activeReport?.dqs ?? 0) * 10);
  const substancePercent = clampPercent((activeReport?.substance_score ?? 0) * 10);
  const hygienePercent = clampPercent((activeReport?.hygiene_score ?? 0) * 10);
  const decisionStatus = activeRecommendation ?? activeReport?.synthesis?.final_recommendation ?? "Challenged";
  const decisionTone = (activeRecommendationTone ?? decisionStatus.toLowerCase()) as "approved" | "challenged" | "blocked";

  const qualityRows = useMemo(
    () =>
      hygieneFindings.length > 0
        ? hygieneFindings.slice(0, 3)
        : activeGovernanceRows.length > 0
          ? activeGovernanceRows.slice(0, 3).map((row) => ({
              check: row.label,
              detail: row.met ? "Control gate is satisfied." : "Control gate is currently missing.",
              status: row.met ? "pass" : "warning",
              score_impact: row.met ? 0 : 0.6,
            }))
          : [
              {
                check: "Financial Model Integrity",
                detail: "Capital allocation follows internal risk-adjusted ROI standards.",
                status: "pass" as const,
                score_impact: 0,
              },
              {
                check: "Governance Checklist",
                detail: "External legal counsel review is missing for international expansion clauses.",
                status: "warning" as const,
                score_impact: 0.8,
              },
              {
                check: "Risk Dimensionality",
                detail: "Market volatility scenarios are not fully explored in Section 4.2.",
                status: "fail" as const,
                score_impact: 1.5,
              },
            ],
    [activeGovernanceRows, hygieneFindings],
  );

  const sortedReviews = [...activeReviews].sort((a, b) => b.score - a.score);
  const strongestReview = sortedReviews[0];
  const primaryHygieneIssue = qualityRows.find((row) => row.status !== "pass");
  const substanceDriver = strongestReview?.thesis ?? "Strong alignment on strategic potential and market timing.";
  const hygieneDriver = primaryHygieneIssue
    ? `${primaryHygieneIssue.status === "fail" ? "Critical Failure" : "Governance Gap"}: ${primaryHygieneIssue.detail}`
    : "Controls are aligned with current governance expectations.";

  const evidenceItems = useMemo(() => {
    const rows: Array<{ id: string; label: string; text: string; url: string | null }> = [];
    citations.forEach((entry, index) => {
      rows.push({
        id: `chair-${index}`,
        label: "Chairperson",
        text: citationText(entry),
        url: null,
      });
    });
    activeReviews.forEach((review, reviewIndex) => {
      review.citations.forEach((citation, citationIndex) => {
        rows.push({
          id: `review-${reviewIndex}-${citationIndex}`,
          label: review.agent,
          text: `${citation.title || citation.claim}`.trim(),
          url: citation.url || null,
        });
      });
    });
    const deduped = new Map<string, { id: string; label: string; text: string; url: string | null }>();
    rows.forEach((row) => {
      const key = `${row.url ?? ""}|${row.text}`;
      if (!deduped.has(key)) {
        deduped.set(key, row);
      }
    });
    return [...deduped.values()].slice(0, 8);
  }, [activeReviews, citations]);

  const liveResearchFeed = useMemo(() => {
    const fromLogs = auditEntries
      .filter((entry) => entry.message.toLowerCase().includes("tavily") || entry.message.toLowerCase().includes("http"))
      .map((entry, index) => ({
        id: `log-${entry.id}`,
        source: entry.type.replace("_", " "),
        detail: entry.message,
        ts: entry.timestamp ?? `L${String(index + 1).padStart(2, "0")}`,
      }));

    if (fromLogs.length > 0) {
      return fromLogs.slice(-6);
    }

    return evidenceItems.slice(0, 6).map((item, index) => ({
      id: `evidence-${item.id}`,
      source: item.label,
      detail: item.text,
      ts: `R${String(index + 1).padStart(2, "0")}`,
    }));
  }, [auditEntries, evidenceItems]);

  const gaugeRadius = 110;
  const gaugeCircumference = 2 * Math.PI * gaugeRadius;
  const gaugeSweepRatio = 0.7;
  const gaugeSweep = gaugeCircumference * gaugeSweepRatio;
  const gaugeGap = gaugeCircumference - gaugeSweep;
  const gaugeTrackDasharray = `${gaugeSweep} ${gaugeGap}`;
  const gaugeFill = (gaugeSweep * dqsPercent) / 100;
  const gaugeFillDasharray = `${gaugeFill} ${gaugeCircumference}`;
  const gaugeTone = dqsPercent >= 75 ? "healthy" : dqsPercent >= 50 ? "watch" : "critical";

  return (
    <section className="preview-mode report-v3-mode">
      {activeReport && activeMetrics ? (
        <div className="briefing-shell">
          {reportStates.length > 1 ? (
            <div className="report-v3-switcher" role="tablist" aria-label="Decision report selector">
              {reportStates.map((state, index) => (
                <button
                  key={state.run_id ? `run-${state.run_id}` : `${state.decision_id}-${state.run_created_at ?? index}`}
                  type="button"
                  role="tab"
                  aria-selected={clampedPreviewIndex === index}
                  className={clampedPreviewIndex === index ? "active" : ""}
                  onClick={() => onPreviewIndexChange(index)}
                >
                  {state.run_created_at
                    ? `Run ${index + 1} - ${formatRunTimestamp(state.run_created_at) || state.decision_name}`
                    : state.decision_name || `Decision ${index + 1}`}
                </button>
              ))}
            </div>
          ) : null}

          {error ? <div className="preview-error">{error}</div> : null}

          <div className="briefing-grid structured-report-grid">
            <article className={`briefing-card outcome-card tone-${decisionTone} layout-row-1-main`}>
              <header>
                <span className="briefing-kicker">Executive Summary</span>
                <span className={`briefing-status tone-${decisionTone}`}>{decisionStatus.toUpperCase()}</span>
              </header>
              <h2>{activeReport.decision_name}</h2>
              <p className="briefing-verdict">
                {summaryLine || activeReport.synthesis?.executive_summary || "No chairperson verdict generated."}
              </p>
              <p className="briefing-meta">
                Decision ID
                {" · "}
                <strong>{activeReport.decision_id.toUpperCase()}</strong>
              </p>
            </article>

            <article className="briefing-card pulse-card layout-row-1-side">
              <h3>Decision Pulse & DQS</h3>
              <div className="report-v3-gauge">
                <svg viewBox="0 0 280 280" aria-hidden="true">
                  <circle
                    className="report-v3-gauge-track"
                    cx="140"
                    cy="140"
                    r={gaugeRadius}
                    strokeDasharray={gaugeTrackDasharray}
                  />
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
              <div className="briefing-governance-stats">
                <span>{blockedReviewCount} blocked reviews</span>
                <span>{missingSectionCount} missing sections</span>
              </div>
            </article>

            <article className="briefing-card scorecard-card layout-row-2-main">
              <h3>Substance vs. Hygiene</h3>
              <table className="briefing-score-table">
                <thead>
                  <tr>
                    <th>Dimension</th>
                    <th>Score</th>
                    <th>Primary Driver</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Substance</td>
                    <td>{Math.round(substancePercent)}/100</td>
                    <td>{substanceDriver}</td>
                  </tr>
                  <tr>
                    <td>Hygiene</td>
                    <td>{Math.round(hygienePercent)}/100</td>
                    <td>{hygieneDriver}</td>
                  </tr>
                </tbody>
              </table>
            </article>

            <article className="briefing-card persona-card layout-row-2-side">
              <h3>Agent Personas</h3>
              <div className="briefing-persona-strip">
                {activeReviews.slice(0, 6).map((review, index) => {
                  const personaScore = Math.round(clampPercent(review.score * 10));
                  const personaStatus = review.blocked ? "Blocked" : review.confidence < 0.65 ? "Challenged" : "Aligned";
                  const personaTone = review.blocked ? "blocked" : review.confidence < 0.65 ? "challenged" : "aligned";

                  return (
                    <article key={`${review.agent}-${index}`} className={`persona-strip-row tone-${personaTone}`}>
                      <div className="persona-strip-head">
                        <span className="persona-strip-label">{formatAgentSummaryLabel(review.agent, index)}</span>
                        <strong className="persona-strip-score">{personaScore}</strong>
                        <span className={`persona-badge tone-${personaTone}`}>{personaStatus}</span>
                      </div>
                      <div
                        className="persona-strip-progress"
                        role="progressbar"
                        aria-label={`${formatAgentSummaryLabel(review.agent, index)} score`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={personaScore}
                      >
                        <span className={`persona-strip-progress-fill tone-${personaTone}`} style={{ width: `${personaScore}%` }} />
                      </div>
                    </article>
                  );
                })}
              </div>
            </article>

            <article className="briefing-card citations-card layout-row-3-col-1">
              <h3>External Citations</h3>
              <div className="briefing-citation-list">
                {evidenceItems.length > 0 ? (
                  evidenceItems.map((item) => (
                    <article key={item.id}>
                      <span>{item.label}</span>
                      {item.url ? (
                        <a href={item.url} target="_blank" rel="noreferrer">{item.text}</a>
                      ) : (
                        <p>{item.text}</p>
                      )}
                    </article>
                  ))
                ) : (
                  <p className="empty-hint">No external citations attached to this run.</p>
                )}
              </div>
            </article>

            <article className="briefing-card feed-card research-feed-card layout-row-3-col-2">
              <h3>Live Research Feed</h3>
              <div className="briefing-feed-list">
                {liveResearchFeed.map((item) => (
                  <p key={item.id}>
                    <span>{item.ts}</span>
                    <strong>[{item.source}]</strong>
                    {item.detail}
                  </p>
                ))}
              </div>
            </article>

            <article className="briefing-card feed-card refinement-feed-card layout-row-3-col-3">
              <h3>Refinement Log</h3>
              <div className="briefing-feed-list">
                {auditEntries.length > 0 ? (
                  auditEntries.slice(-8).map((entry) => (
                    <p key={entry.id}>
                      <span>{entry.timestamp ?? "--:--:--"}</span>
                      <strong>[{entry.type.replace("_", " ")}]</strong>
                      {entry.message}
                    </p>
                  ))
                ) : (
                  <p className="empty-hint">Waiting for refinement rounds.</p>
                )}
              </div>
            </article>

            <article className="briefing-card ancestry-card layout-row-4-full">
              <h3>Decision Ancestry</h3>
              <p className="briefing-ancestry-meta">
                Retrieval
                {" · "}
                {activeReport.decision_ancestry_retrieval_method === "vector-db"
                  ? "Vector DB"
                  : activeReport.decision_ancestry_retrieval_method === "lexical-fallback"
                    ? "Lexical fallback"
                    : "Not available"}
              </p>
              {decisionAncestry.length > 0 ? (
                <ul>
                  {decisionAncestry.slice(0, 3).map((match) => (
                    <li key={match.decision_id}>
                      <strong>{match.decision_name}</strong>
                      <span>{Math.round(match.similarity * 100)}% similarity</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-hint">No ancestry matches stored for this decision yet.</p>
              )}
            </article>
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
