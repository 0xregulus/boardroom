import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  CreateStrategyDraft,
  DraftCapitalAllocation,
  DraftCoreProperties,
  DraftRiskProperties,
  StrategicMitigationEntry,
} from "../types";
import { STRATEGIC_ARTIFACT_SECTIONS } from "../constants";
import { useSocraticAgent } from "../../../hooks/useSocraticAgent";
import { defaultMatrixForSection, isSocraticSessionBoardReady, parseSectionMatrix, serializeSectionMatrix } from "../utils";
import { CreateStrategyArtifactSections } from "./CreateStrategyArtifactSections";
import { CreateStrategyConfigPanels } from "./CreateStrategyConfigPanels";
import { CreateStrategyEvidencePane } from "./CreateStrategyEvidencePane";
import { SocraticSidebar, type ResearchSuggestion, type RiskSuggestion } from "./SocraticSidebar";

interface CreateStrategyStageProps {
  createDraft: CreateStrategyDraft;
  isCreateReadOnly: boolean;
  isCoreCollapsed: boolean;
  isCapitalCollapsed: boolean;
  isRiskCollapsed: boolean;
  riskAdjustedValue: number;
  riskAdjustedRoi: number | null;
  weightedCapitalScore: number | null;
  riskScore: string;
  onDraftNameChange: (value: string) => void;
  onToggleCore: () => void;
  onToggleCapital: () => void;
  onToggleRisk: () => void;
  onUpdateCoreProperty: (field: keyof DraftCoreProperties, value: string) => void;
  onUpdateCapitalAllocation: (field: keyof DraftCapitalAllocation, value: string | number) => void;
  onUpdateRiskProperty: (field: keyof DraftRiskProperties, value: string) => void;
  onUpdateSection: (sectionKey: string, value: string) => void;
  onLogMitigation: (entry: StrategicMitigationEntry) => void;
  onRunAnalysis: () => void;
  onCancel: () => void;
  onSave: () => void;
}

const STRATEGIC_DOCUMENT_SECTIONS = STRATEGIC_ARTIFACT_SECTIONS.filter((section) => section.key !== "executiveSummary");
const SECTION_TITLE_BY_KEY = Object.fromEntries(STRATEGIC_ARTIFACT_SECTIONS.map((section) => [section.key, section.title])) as Record<string, string>;

function sourceFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Tavily";
  }
}

function appendEvidenceToSection(currentValue: string, snippet: string, source: string, url?: string): string {
  const cleanSnippet = snippet.trim().replace(/\s+/g, " ");
  if (cleanSnippet.length === 0) {
    return currentValue;
  }
  const citation = url ? ` (${url})` : "";
  const evidenceLine = `- Evidence [${source}]: ${cleanSnippet}${citation}`;
  const existing = currentValue
    .split("\n")
    .map((line) => line.trim().toLowerCase());
  if (existing.includes(evidenceLine.toLowerCase())) {
    return currentValue;
  }
  const trimmed = currentValue.trimEnd();
  return trimmed.length > 0 ? `${trimmed}\n${evidenceLine}` : evidenceLine;
}

function buildRiskId(sectionKey: string, gap: string): string {
  const normalizedGap = gap
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return `risk-${sectionKey}-${normalizedGap || "finding"}`;
}

function appendMitigationToRiskMatrix(currentValue: string, riskTitle: string, mitigationText: string): string {
  const trimmedMitigation = mitigationText.trim();
  if (trimmedMitigation.length === 0) {
    return currentValue;
  }

  const matrix = parseSectionMatrix(currentValue, defaultMatrixForSection("riskMatrix"));
  const riskColumnIndex = matrix.headers.findIndex((header) => /risk/i.test(header));
  const mitigationColumnIndex = matrix.headers.findIndex((header) => /mitigation/i.test(header));

  const hasDuplicate = matrix.rows.some((row) => {
    const existingRisk = riskColumnIndex >= 0 ? (row[riskColumnIndex] ?? "").trim().toLowerCase() : "";
    const existingMitigation = mitigationColumnIndex >= 0 ? (row[mitigationColumnIndex] ?? "").trim().toLowerCase() : "";
    return existingRisk === riskTitle.trim().toLowerCase() && existingMitigation === trimmedMitigation.toLowerCase();
  });
  if (hasDuplicate) {
    return currentValue;
  }

  const nextRow = new Array(matrix.headers.length).fill("");
  if (riskColumnIndex >= 0) {
    nextRow[riskColumnIndex] = riskTitle;
  }
  if (mitigationColumnIndex >= 0) {
    nextRow[mitigationColumnIndex] = trimmedMitigation;
  }

  const nextMatrix = {
    ...matrix,
    rows: [...matrix.rows, nextRow],
  };

  return serializeSectionMatrix(nextMatrix);
}

function validateMitigationPlan(
  risk: { riskTitle: string; description: string; riskLevel: "Critical" | "Warning" },
  mitigationText: string,
): string | null {
  const normalized = mitigationText.trim();
  if (normalized.length < 28) {
    return "Mitigation is too short. Add an explicit operational plan.";
  }
  if (!/\b(implement|enforce|roll ?back|monitor|cap|hedge|allocate|assign|stage|gate|fallback|throttle|automate|ship)\b/i.test(normalized)) {
    return "Mitigation needs concrete actions (for example: implement, monitor, cap, rollback).";
  }
  if (!/\b(owner|team|engineering|finance|legal|ops|within|by\s+\d|week|month|quarter|q[1-4]|sla)\b/i.test(normalized)) {
    return "Mitigation should include ownership or timing so it is executable.";
  }

  const sourceTokens = `${risk.riskTitle} ${risk.description}`
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 5)
    .slice(0, 16);
  const normalizedLower = normalized.toLowerCase();
  const tokenHit = sourceTokens.some((token) => normalizedLower.includes(token));
  if (!tokenHit) {
    return "Mitigation must address the specific failure state, not a generic response.";
  }

  if (risk.riskLevel === "Critical" && normalized.length < 48) {
    return "Critical risks need a fuller mitigation with controls and contingency details.";
  }

  return null;
}


export function CreateStrategyStage({
  createDraft,
  isCreateReadOnly,
  isCoreCollapsed,
  isCapitalCollapsed,
  isRiskCollapsed,
  riskAdjustedValue,
  riskAdjustedRoi,
  weightedCapitalScore,
  riskScore,
  onDraftNameChange,
  onToggleCore,
  onToggleCapital,
  onToggleRisk,
  onUpdateCoreProperty,
  onUpdateCapitalAllocation,
  onUpdateRiskProperty,
  onUpdateSection,
  onLogMitigation,
  onRunAnalysis,
  onCancel,
  onSave,
}: CreateStrategyStageProps) {
  const {
    session: socraticSession,
    strategicDocument,
    liveFeed,
    isObserving,
    activeSectionKey,
    highlightedSectionKey,
    researchLinksBySection,
    clippedEvidenceBySection,
    researchLoadingSection,
    setActiveSectionKey,
    focusSection,
    requestResearch,
    clipResearchEvidence,
    runDraftBoardAction,
  } = useSocraticAgent({
    documentContent: createDraft,
    isReadOnly: isCreateReadOnly,
  });
  const [isRedTeamMode, setIsRedTeamMode] = useState(false);
  const [isHandoffInProgress, setIsHandoffInProgress] = useState(false);
  const [isSnapPulseActive, setIsSnapPulseActive] = useState(false);
  const handoffTimerRef = useRef<number | null>(null);
  const snapPulseTimerRef = useRef<number | null>(null);
  const referenceFrameRef = useRef<HTMLDivElement | null>(null);
  const [evidenceOffsetsBySection, setEvidenceOffsetsBySection] = useState<Record<string, number>>({});
  const [evidenceCanvasHeight, setEvidenceCanvasHeight] = useState(0);
  const riskPills = useMemo<RiskSuggestion[]>(() => {
    const mitigationById = new Map(createDraft.mitigations.map((entry) => [entry.id, entry]));
    const mitigationBySignature = new Map(
      createDraft.mitigations.map((entry) => [`${entry.sectionKey}:${entry.description.trim().toLowerCase()}`, entry]),
    );
    const deduped = new Set<string>();
    const suggestions: RiskSuggestion[] = [];
    const sourceRiskPills =
      strategicDocument.socratic_layer.risk_pills.length > 0
        ? strategicDocument.socratic_layer.risk_pills
        : strategicDocument.socratic_layer.logic_gaps.map((gap) => ({
          section_key: gap.section_key,
          section_title: gap.section_title,
          risk_title: gap.section_title,
          description: gap.gap,
          risk_level: (gap.section_key === "financialModel" || gap.section_key === "riskMatrix" ? "Critical" : "Warning") as "Critical" | "Warning",
        }));

    sourceRiskPills.forEach((pill) => {
      const description = pill.description.trim();
      if (description.length === 0) {
        return;
      }
      const sectionKey = pill.section_key;
      const id = buildRiskId(sectionKey, `${pill.risk_title} ${description}`);
      if (deduped.has(id)) {
        return;
      }
      deduped.add(id);
      const signature = `${sectionKey}:${description.toLowerCase()}`;
      const mitigation = mitigationById.get(id) ?? mitigationBySignature.get(signature);
      suggestions.push({
        id,
        riskTitle: pill.risk_title?.trim().length ? pill.risk_title : pill.section_title?.trim().length ? pill.section_title : SECTION_TITLE_BY_KEY[sectionKey] ?? "Strategic Risk",
        description,
        sectionKey,
        riskLevel: pill.risk_level,
        resolved: Boolean(mitigation),
        resolvedMitigation: mitigation?.mitigationText,
      });
    });

    const redTeamCritique = strategicDocument.socratic_layer.red_team_critique.trim();
    if (redTeamCritique.length > 0) {
      const id = buildRiskId("riskMatrix", redTeamCritique);
      if (!deduped.has(id)) {
        const signature = `riskMatrix:${redTeamCritique.toLowerCase()}`;
        const mitigation = mitigationById.get(id) ?? mitigationBySignature.get(signature);
        suggestions.push({
          id,
          riskTitle: "Red-Team Countercase",
          description: redTeamCritique,
          sectionKey: "riskMatrix",
          riskLevel: "Critical",
          resolved: Boolean(mitigation),
          resolvedMitigation: mitigation?.mitigationText,
        });
      }
    }

    return suggestions.slice(0, 10);
  }, [
    createDraft.mitigations,
    strategicDocument.socratic_layer.logic_gaps,
    strategicDocument.socratic_layer.red_team_critique,
    strategicDocument.socratic_layer.risk_pills,
  ]);
  const unresolvedRiskCount = useMemo(() => riskPills.filter((pill) => !pill.resolved).length, [riskPills]);
  const unresolvedCriticalRiskCount = useMemo(
    () => riskPills.filter((pill) => !pill.resolved && pill.riskLevel === "Critical").length,
    [riskPills],
  );
  const hasUnresolvedRiskBlockers = isRedTeamMode && unresolvedRiskCount > 0;
  const effectiveReadinessScore = useMemo(() => {
    const baseReadiness = strategicDocument.metadata.readinessScore;
    if (!isRedTeamMode) {
      return baseReadiness;
    }
    const penalized = Math.max(0, baseReadiness - unresolvedRiskCount * 15);
    if (unresolvedCriticalRiskCount > 0) {
      return Math.min(penalized, 70);
    }
    return penalized;
  }, [isRedTeamMode, strategicDocument.metadata.readinessScore, unresolvedCriticalRiskCount, unresolvedRiskCount]);
  const canSave = isCreateReadOnly || isSocraticSessionBoardReady(socraticSession);
  const readyForBoard = effectiveReadinessScore >= 80 && !hasUnresolvedRiskBlockers;
  const showSubmitAction = effectiveReadinessScore >= 80 || hasUnresolvedRiskBlockers;
  const dqsPreview = useMemo(
    () => Math.round((socraticSession.confidenceScore + effectiveReadinessScore) / 2),
    [effectiveReadinessScore, socraticSession.confidenceScore],
  );
  const activeInquiry = strategicDocument.socratic_layer.active_inquiry || null;
  const logicGapFeed = useMemo(
    () =>
      liveFeed.slice(0, 8).map((item) => ({
        id: item.id,
        text: item.message,
        sectionKey: item.sectionKey,
      })),
    [liveFeed],
  );
  const priorityInquirySection =
    activeSectionKey ?? socraticSession.checklist.find((item) => item.status === "attention")?.sectionKey ?? "financialModel";
  const suggestedResearch = useMemo<ResearchSuggestion[]>(() => {
    const seen = new Set<string>();
    const items: ResearchSuggestion[] = [];

    Object.entries(researchLinksBySection).forEach(([sectionKey, links]) => {
      links.forEach((link, index) => {
        if (!link.url || seen.has(link.url)) {
          return;
        }
        seen.add(link.url);
        const sectionLabel = SECTION_TITLE_BY_KEY[sectionKey] ?? sectionKey;
        items.push({
          id: `${sectionKey}-link-${index}-${link.url}`,
          source: sourceFromUrl(link.url),
          snippet: link.snippet?.trim().length ? link.snippet : link.title,
          url: link.url,
          sectionTarget: sectionKey,
          sectionLabel,
        });
      });
    });

    strategicDocument.socratic_layer.suggested_research.forEach((query, index) => {
      const next = query.trim();
      if (next.length === 0) {
        return;
      }
      const target = priorityInquirySection;
      items.push({
        id: `query-${index}-${next}`,
        source: "Socratic Query",
        snippet: next,
        sectionTarget: target,
        sectionLabel: SECTION_TITLE_BY_KEY[target] ?? target,
      });
    });

    return items.slice(0, 12);
  }, [priorityInquirySection, researchLinksBySection, strategicDocument.socratic_layer.suggested_research]);
  const evidenceItems = useMemo(() => {
    const checklistBySection = socraticSession.checklist.reduce<Record<string, string>>((acc, item) => {
      acc[item.sectionKey] = item.prompt;
      return acc;
    }, {});
    return STRATEGIC_DOCUMENT_SECTIONS.map((section) => ({
      sectionKey: section.key,
      sectionTitle: section.title,
      prompt: checklistBySection[section.key] ?? "What evidence validates this section?",
      researchLinks: researchLinksBySection[section.key] ?? [],
      clippedLinks: clippedEvidenceBySection[section.key] ?? [],
      isResearching: researchLoadingSection === section.key,
    }));
  }, [clippedEvidenceBySection, researchLinksBySection, researchLoadingSection, socraticSession.checklist]);

  const setRedTeamMode = useCallback(
    (enabled: boolean) => {
      setIsRedTeamMode(enabled);
      void runDraftBoardAction(enabled ? "simulate_red_team" : "verify_assumptions");
    },
    [runDraftBoardAction],
  );

  const researchActiveInquiry = useCallback(() => {
    void requestResearch(priorityInquirySection, activeInquiry ?? undefined);
  }, [activeInquiry, priorityInquirySection, requestResearch]);

  const handleSubmitToBoard = useCallback(() => {
    if (isHandoffInProgress || hasUnresolvedRiskBlockers) {
      return;
    }
    setIsHandoffInProgress(true);
    if (typeof window === "undefined") {
      onSave();
      return;
    }
    if (handoffTimerRef.current !== null) {
      window.clearTimeout(handoffTimerRef.current);
    }
    handoffTimerRef.current = window.setTimeout(() => {
      onSave();
    }, 950);
  }, [hasUnresolvedRiskBlockers, isHandoffInProgress, onSave]);

  const handleMitigateRisk = useCallback(
    async (riskId: string, mitigationText: string): Promise<string | null> => {
      const resolvedRisk = riskPills.find((risk) => risk.id === riskId);
      if (!resolvedRisk) {
        return "Risk item was not found. Refresh and try again.";
      }

      const normalizedMitigation = mitigationText.trim();
      if (normalizedMitigation.length === 0) {
        return "Mitigation cannot be empty.";
      }

      const validationError = validateMitigationPlan(resolvedRisk, normalizedMitigation);
      if (validationError) {
        return validationError;
      }

      try {
        const response = await fetch("/api/socratic/validate-substance", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            riskTitle: resolvedRisk.riskTitle,
            riskDescription: resolvedRisk.description,
            mitigationText: normalizedMitigation,
          }),
        });
        const payload = (await response.json()) as { approved?: boolean; substanceScore?: number; feedback?: string; error?: string };
        if (!response.ok) {
          if (payload.error) {
            return payload.error;
          }
          return "Substance validator is unavailable right now. Try again.";
        }
        if (!payload.approved || (payload.substanceScore !== undefined && payload.substanceScore < 0.7)) {
          return payload.feedback?.trim().length
            ? payload.feedback
            : `Mitigation rejected (Substance Score: ${payload.substanceScore ?? "low"}). Add specific controls and timing.`;
        }
      } catch {
        return "Substance validator is unavailable right now. Try again.";
      }

      onLogMitigation({
        id: riskId,
        sectionKey: resolvedRisk.sectionKey,
        riskTitle: resolvedRisk.riskTitle,
        description: resolvedRisk.description,
        mitigationText: normalizedMitigation,
        resolvedAt: new Date().toISOString(),
      });

      const currentRiskMatrix = createDraft.sections.riskMatrix ?? "";
      const nextRiskMatrix = appendMitigationToRiskMatrix(currentRiskMatrix, resolvedRisk.riskTitle, normalizedMitigation);
      if (nextRiskMatrix !== currentRiskMatrix) {
        onUpdateSection("riskMatrix", nextRiskMatrix);
      }
      focusSection("riskMatrix");
      return null;
    },
    [createDraft.sections.riskMatrix, focusSection, onLogMitigation, onUpdateSection, riskPills],
  );

  useEffect(() => {
    return () => {
      if (handoffTimerRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(handoffTimerRef.current);
      }
      if (snapPulseTimerRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(snapPulseTimerRef.current);
      }
    };
  }, []);

  const handleSnapResearch = useCallback(
    (item: ResearchSuggestion) => {
      const sectionKey = item.sectionTarget;
      const current = createDraft.sections[sectionKey] ?? "";
      const next = appendEvidenceToSection(current, item.snippet, item.source, item.url);
      if (next !== current) {
        onUpdateSection(sectionKey, next);
      }
      focusSection(sectionKey);

      setIsSnapPulseActive(true);
      if (typeof window !== "undefined") {
        if (snapPulseTimerRef.current !== null) {
          window.clearTimeout(snapPulseTimerRef.current);
        }
        snapPulseTimerRef.current = window.setTimeout(() => {
          setIsSnapPulseActive(false);
        }, 650);
      }
    },
    [createDraft.sections, focusSection, onUpdateSection],
  );

  useEffect(() => {
    if (isCreateReadOnly || typeof window === "undefined") {
      return;
    }
    const frame = referenceFrameRef.current;
    if (!frame) {
      return;
    }

    let rafId: number | null = null;
    const recalculateOffsets = () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      rafId = window.requestAnimationFrame(() => {
        const frameRect = frame.getBoundingClientRect();
        const nextOffsets: Record<string, number> = {};
        let maxBottom = frame.offsetHeight;

        for (const section of STRATEGIC_DOCUMENT_SECTIONS) {
          const sectionNode = document.getElementById(`section-${section.key}`);
          if (!sectionNode) {
            continue;
          }
          const rect = sectionNode.getBoundingClientRect();
          nextOffsets[section.key] = Math.max(0, Math.round(rect.top - frameRect.top));
          maxBottom = Math.max(maxBottom, Math.round(rect.bottom - frameRect.top));
        }

        setEvidenceOffsetsBySection(nextOffsets);
        setEvidenceCanvasHeight(maxBottom);
      });
    };

    recalculateOffsets();

    const observer = new ResizeObserver(() => recalculateOffsets());
    observer.observe(frame);
    for (const section of STRATEGIC_DOCUMENT_SECTIONS) {
      const sectionNode = document.getElementById(`section-${section.key}`);
      if (sectionNode) {
        observer.observe(sectionNode);
      }
    }
    window.addEventListener("resize", recalculateOffsets);

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      observer.disconnect();
      window.removeEventListener("resize", recalculateOffsets);
    };
  }, [createDraft.sections, isCreateReadOnly, isRedTeamMode, socraticSession.sectionReadinessByKey]);

  return (
    <section className="create-strategy-stage">
      <div className={`create-editor-stream${isHandoffInProgress ? " handoff-active" : ""}`}>
        <div className="create-reference-frame" ref={referenceFrameRef}>
          <article className="create-reference-card">
            <div className="create-reference-body">
              <div className="create-reference-top">
                <div className="create-reference-target-wrap" aria-hidden="true">
                  <span className="create-reference-target">◉</span>
                </div>
                <div className="create-reference-version">Strategic Decision / v2.4</div>
              </div>

              {!isCreateReadOnly ? (
                <section className="create-cockpit-toolbar" aria-label="Strategic cockpit controls">
                  <div className="create-dqs-preview" aria-label="Decision quality preview">
                    <span>DQS Preview</span>
                    <strong>{dqsPreview}</strong>
                    <em>Readiness {effectiveReadinessScore}%</em>
                  </div>
                </section>
              ) : null}

              <section className="create-title-section">
                <label className="create-title-label">Decision Title</label>
                <input
                  type="text"
                  value={createDraft.name}
                  onChange={(event) => onDraftNameChange(event.target.value)}
                  placeholder="e.g. Market Entry"
                  className="create-title-input"
                  readOnly={isCreateReadOnly}
                />
              </section>

              <CreateStrategyConfigPanels
                createDraft={createDraft}
                isCreateReadOnly={isCreateReadOnly}
                isCoreCollapsed={isCoreCollapsed}
                isCapitalCollapsed={isCapitalCollapsed}
                isRiskCollapsed={isRiskCollapsed}
                riskAdjustedValue={riskAdjustedValue}
                riskAdjustedRoi={riskAdjustedRoi}
                weightedCapitalScore={weightedCapitalScore}
                riskScore={riskScore}
                onToggleCore={onToggleCore}
                onToggleCapital={onToggleCapital}
                onToggleRisk={onToggleRisk}
                onUpdateCoreProperty={onUpdateCoreProperty}
                onUpdateCapitalAllocation={onUpdateCapitalAllocation}
                onUpdateRiskProperty={onUpdateRiskProperty}
              />

              <CreateStrategyArtifactSections
                createDraft={createDraft}
                isCreateReadOnly={isCreateReadOnly}
                activeSectionKey={activeSectionKey}
                highlightedSectionKey={highlightedSectionKey}
                isRedTeamMode={isRedTeamMode}
                sectionReadinessByKey={socraticSession.sectionReadinessByKey}
                checklist={socraticSession.checklist}
                ghostTextBySection={socraticSession.ghostTextBySection}
                onSectionFocus={setActiveSectionKey}
                onUpdateSection={onUpdateSection}
              />
            </div>

            <footer className="create-strategy-footer">
              <div className="create-strategy-footer-actions">
                {isCreateReadOnly ? (
                  <>
                    <button type="button" className="create-save-button" onClick={onRunAnalysis}>
                      Run Analysis
                    </button>
                    <button type="button" className="create-cancel-button" onClick={onCancel}>
                      Back
                    </button>
                  </>
                ) : (
                  <>
                    {showSubmitAction ? (
                      <button
                        type="button"
                        className="create-submit-board-button"
                        onClick={handleSubmitToBoard}
                        disabled={isHandoffInProgress || hasUnresolvedRiskBlockers}
                        title={hasUnresolvedRiskBlockers ? "Resolve all governance blockers before submitting to the board." : undefined}
                      >
                        {isHandoffInProgress
                          ? "Submitting..."
                          : hasUnresolvedRiskBlockers
                            ? `Resolve ${unresolvedRiskCount} blocker${unresolvedRiskCount === 1 ? "" : "s"}`
                            : readyForBoard
                              ? "Submit to Board"
                              : "Preparing Submission"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="create-save-button"
                      onClick={onSave}
                      disabled={!canSave || isHandoffInProgress}
                      title={!canSave ? "Raise Socratic score and resolve thin sections before saving." : undefined}
                    >
                      Save
                    </button>
                    <button type="button" className="create-cancel-button" onClick={onCancel} disabled={isHandoffInProgress}>
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

        {!isCreateReadOnly ? (
          <div className={`create-right-rail${isHandoffInProgress ? " handoff-active" : ""}`}>
            <CreateStrategyEvidencePane
              items={evidenceItems}
              offsetsBySection={evidenceOffsetsBySection}
              canvasHeight={evidenceCanvasHeight}
              onRequestResearch={(sectionKey) => {
                void requestResearch(sectionKey);
              }}
              onClipEvidence={clipResearchEvidence}
            />

            <div className={`create-socratic-pane${isHandoffInProgress ? " collapsing" : ""}`}>
              <SocraticSidebar
                readinessScore={effectiveReadinessScore}
                activeInquiry={activeInquiry}
                logicGaps={logicGapFeed}
                suggestedResearch={suggestedResearch}
                riskPills={riskPills}
                isThinking={isObserving || researchLoadingSection !== null || isSnapPulseActive}
                isRedTeamMode={isRedTeamMode}
                redTeamToggleDisabled={isObserving || isHandoffInProgress}
                handoffInProgress={isHandoffInProgress}
                onFocusGap={(sectionKey) => {
                  if (sectionKey) {
                    focusSection(sectionKey);
                  }
                }}
                onResearchActiveInquiry={researchActiveInquiry}
                onSnapResearch={handleSnapResearch}
                onMitigateRisk={handleMitigateRisk}
                onInitiateBoardReview={handleSubmitToBoard}
                onToggleRedTeam={setRedTeamMode}
              />
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
