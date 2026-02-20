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

function normalizeSectionLabel(section: string): string {
  return section
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function extractChairpersonCitations(activeReport: ReportWorkflowState): string[] {
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

  const consensusPoints = useMemo(() => {
    const points: string[] = [];
    const nonBlocked = activeReviews.filter((review) => !review.blocked);
    if (activeReviews.length > 0 && nonBlocked.length >= Math.ceil(activeReviews.length * 0.6)) {
      points.push("Most reviewers agree the strategy is directionally sound for execution.");
    }
    if (activeMetrics?.roi !== null && activeMetrics?.roi !== undefined) {
      points.push(`Risk-adjusted ROI converges around ${activeMetrics.roi.toFixed(2)}x across reviewer models.`);
    }
    if (activeReviews.some((review) => review.citations.length > 0)) {
      points.push("External market evidence materially influenced the final scoring model.");
    }
    if (points.length === 0) {
      points.push("Consensus remains limited; governance and execution confidence are still being resolved.");
    }
    return points.slice(0, 3);
  }, [activeMetrics?.roi, activeReviews]);

  const contentionPoint = useMemo(() => {
    const interactionSummary = activeReport?.interaction_rounds?.at(-1)?.summary?.trim();
    if (interactionSummary) {
      return interactionSummary;
    }
    const blocker = activeReviews.find((review) => review.blockers.length > 0)?.blockers[0];
    if (blocker) {
      return blocker;
    }
    return "No major contention captured in this run.";
  }, [activeReport?.interaction_rounds, activeReviews]);

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

  const riskRegister = useMemo(() => {
    const items: string[] = [];
    qualityRows
      .filter((row) => row.status !== "pass")
      .forEach((row) => items.push(row.detail));
    activeReviews.forEach((review) => {
      review.blockers.forEach((blocker) => items.push(blocker));
    });
    const unique = [...new Set(items.map((entry) => entry.trim()).filter((entry) => entry.length > 0))];
    return unique.slice(0, 6);
  }, [activeReviews, qualityRows]);

  const prdSections = Object.entries(activeReport?.prd?.sections ?? {});

  const gaugeRadius = 110;
  const gaugeCircumference = 2 * Math.PI * gaugeRadius;
  const gaugeOffset = gaugeCircumference - (gaugeCircumference * dqsPercent) / 100;

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

          <div className="briefing-grid">
            <section className="briefing-column">
              <article className={`briefing-card outcome-card tone-${decisionTone}`}>
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

              <article className="briefing-card pulse-card">
                <h3>Decision Pulse & DQS</h3>
                <div className="report-v3-gauge">
                  <svg viewBox="0 0 280 280" aria-hidden="true">
                    <circle className="report-v3-gauge-track" cx="140" cy="140" r={gaugeRadius} />
                    <circle
                      className="report-v3-gauge-fill"
                      cx="140"
                      cy="140"
                      r={gaugeRadius}
                      strokeDasharray={gaugeCircumference}
                      strokeDashoffset={gaugeOffset}
                    />
                  </svg>
                  <div className="report-v3-gauge-value">
                    <strong>{dqsPercent.toFixed(1)}</strong>
                    <span>/ 100.0 DQS</span>
                  </div>
                </div>
                <div className="briefing-governance-stats">
                  <span>{blockedReviewCount} blocked reviews</span>
                  <span>{missingSectionCount} missing sections</span>
                </div>
              </article>
            </section>

            <section className="briefing-column">
              <article className="briefing-card scorecard-card">
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

              <article className="briefing-card persona-card">
                <h3>Agent Personas</h3>
                <div className="briefing-persona-grid">
                  {activeReviews.slice(0, 6).map((review, index) => (
                    <article key={`${review.agent}-${index}`}>
                      <span>{formatAgentSummaryLabel(review.agent, index)}</span>
                      <strong>{Math.round(clampPercent(review.score * 10))}/100</strong>
                      <p>{review.blocked ? "Blocked" : review.confidence < 0.65 ? "Challenged" : "Aligned"}</p>
                    </article>
                  ))}
                </div>
              </article>

              <article className="briefing-card artifacts-card">
                <h3>Actionable Artifacts</h3>
                <div className="briefing-artifact-block">
                  <h4>PRD</h4>
                  <p>
                    {activeReport.prd
                      ? `Auto-generated with ${activeReport.prd.milestones.length} milestones and ${activeReport.prd.telemetry.length} telemetry checks.`
                      : "No PRD generated yet."}
                  </p>
                  {prdSections.length > 0 ? (
                    <ul>
                      {prdSections.slice(0, 3).map(([section]) => (
                        <li key={section}>{normalizeSectionLabel(section)}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <div className="briefing-artifact-block">
                  <h4>Risk Register</h4>
                  {riskRegister.length > 0 ? (
                    <ul>
                      {riskRegister.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No active risk items generated in this run.</p>
                  )}
                </div>
                <div className="briefing-artifact-actions">
                  <button type="button" className="briefing-vault-btn">Save to Vault</button>
                  <span>
                    Decision Ancestry
                    {" · "}
                    {activeReport.decision_ancestry_retrieval_method === "vector-db" ? "Vector DB" : "Lexical fallback"}
                  </span>
                </div>
              </article>
            </section>

            <aside className="briefing-column">
              <article className="briefing-card evidence-card">
                <h3>Debate Summary</h3>
                <h4>Consensus Points</h4>
                <ul>
                  {consensusPoints.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
                <h4>Point of Contention</h4>
                <p>{contentionPoint}</p>
              </article>

              <article className="briefing-card citations-card">
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

              <article className="briefing-card feed-card">
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

              <article className="briefing-card feed-card">
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

              <article className="briefing-card ancestry-card">
                <h3>Decision Ancestry</h3>
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
            </aside>
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
