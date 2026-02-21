import { useEffect, useMemo, useRef, useState } from "react";

import { DecisionPulse2D } from "./DecisionPulse2D";
import { RedTeamToggle } from "./RedTeamToggle";
import { ResearchPill, type ResearchPillItem } from "./ResearchPill";
import { RiskPill } from "./RiskPill";

interface LogicGapItem {
  id: string;
  text: string;
  sectionKey?: string;
}

export type ResearchSuggestion = ResearchPillItem;

export interface RiskSuggestion {
  id: string;
  riskTitle: string;
  description: string;
  sectionKey: string;
  riskLevel: "Critical" | "Warning";
  resolved: boolean;
  resolvedMitigation?: string;
}

interface SocraticSidebarProps {
  readinessScore: number;
  activeInquiry: string | null;
  logicGaps: LogicGapItem[];
  suggestedResearch: ResearchSuggestion[];
  riskPills: RiskSuggestion[];
  isThinking: boolean;
  isRedTeamMode: boolean;
  redTeamToggleDisabled?: boolean;
  handoffInProgress?: boolean;
  onFocusGap?: (sectionKey?: string) => void;
  onResearchActiveInquiry?: () => void;
  onSnapResearch?: (item: ResearchSuggestion) => void;
  onMitigateRisk?: (riskId: string, mitigationText: string) => Promise<string | null> | string | null;
  onInitiateBoardReview?: () => void;
  onToggleRedTeam?: (enabled: boolean) => void;
}

export function SocraticSidebar({
  readinessScore,
  activeInquiry,
  logicGaps,
  suggestedResearch,
  riskPills,
  isThinking,
  isRedTeamMode,
  redTeamToggleDisabled = false,
  handoffInProgress = false,
  onFocusGap,
  onResearchActiveInquiry,
  onSnapResearch,
  onMitigateRisk,
  onToggleRedTeam,
  onInitiateBoardReview,
}: SocraticSidebarProps) {
  const [riskAlertPulseActive, setRiskAlertPulseActive] = useState(false);
  const [settlingPulseActive, setSettlingPulseActive] = useState(false);
  const unresolvedRiskCount = useMemo(() => riskPills.filter((risk) => !risk.resolved).length, [riskPills]);
  const unresolvedCriticalRiskCount = useMemo(
    () => riskPills.filter((risk) => !risk.resolved && risk.riskLevel === "Critical").length,
    [riskPills],
  );
  const resolvedRiskCount = useMemo(() => riskPills.filter((risk) => risk.resolved).length, [riskPills]);
  const previousUnresolvedRef = useRef(unresolvedRiskCount);
  const previousResolvedRef = useRef(resolvedRiskCount);
  const riskAlertTimerRef = useRef<number | null>(null);
  const settlingTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isRedTeamMode) {
      previousUnresolvedRef.current = unresolvedRiskCount;
      return;
    }
    if (unresolvedRiskCount > previousUnresolvedRef.current) {
      setRiskAlertPulseActive(true);
      if (typeof window !== "undefined") {
        if (riskAlertTimerRef.current !== null) {
          window.clearTimeout(riskAlertTimerRef.current);
        }
        riskAlertTimerRef.current = window.setTimeout(() => {
          setRiskAlertPulseActive(false);
        }, 1800);
      }
    }
    previousUnresolvedRef.current = unresolvedRiskCount;
  }, [isRedTeamMode, unresolvedRiskCount]);

  useEffect(() => {
    if (resolvedRiskCount > previousResolvedRef.current) {
      setSettlingPulseActive(true);
      if (typeof window !== "undefined") {
        if (settlingTimerRef.current !== null) {
          window.clearTimeout(settlingTimerRef.current);
        }
        settlingTimerRef.current = window.setTimeout(() => {
          setSettlingPulseActive(false);
        }, 2000);
      }
    }
    previousResolvedRef.current = resolvedRiskCount;
  }, [resolvedRiskCount]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined") {
        if (riskAlertTimerRef.current !== null) {
          window.clearTimeout(riskAlertTimerRef.current);
        }
        if (settlingTimerRef.current !== null) {
          window.clearTimeout(settlingTimerRef.current);
        }
      }
    };
  }, []);

  const topGapSection = logicGaps.find((gap) => typeof gap.sectionKey === "string")?.sectionKey ?? null;
  const tugVector = useMemo<[number, number] | null>(() => {
    if (handoffInProgress) {
      return null;
    }
    if (isRedTeamMode && (riskAlertPulseActive || unresolvedRiskCount > 0 || unresolvedCriticalRiskCount > 0)) {
      return [0.98, 0.08];
    }
    if (!topGapSection) {
      return null;
    }
    const vectors: Record<string, [number, number]> = {
      strategicContext: [0.2, -0.9],
      problemFraming: [-0.85, -0.3],
      optionsEvaluated: [-0.85, 0.35],
      financialModel: [0.88, -0.22],
      riskMatrix: [0.95, 0.3],
      downsideModel: [0.42, 0.88],
      finalDecision: [-0.45, 0.86],
      killCriteria: [0.7, 0.62],
      complianceMonitoring: [0.97, 0.5],
    };
    return vectors[topGapSection] ?? null;
  }, [handoffInProgress, isRedTeamMode, riskAlertPulseActive, topGapSection, unresolvedCriticalRiskCount, unresolvedRiskCount]);
  const readinessClass = readinessScore >= 85 ? "board-ready" : "drafting";
  const canInitiateBoardReview = readinessScore >= 100 && unresolvedRiskCount === 0 && !handoffInProgress;
  const pulseMode = isRedTeamMode ? "socratic-red-team" : "socratic";

  return (
    <aside
      className={`socratic-sidebar ${readinessClass}${canInitiateBoardReview ? " perfect-ready" : ""}${handoffInProgress ? " handoff" : ""}${isRedTeamMode ? " red-team-mode" : ""}`}
      aria-label="Socratic sidebar"
    >
      <RedTeamToggle isRedTeamMode={isRedTeamMode} disabled={redTeamToggleDisabled} onToggle={(enabled) => onToggleRedTeam?.(enabled)} />

      <header className="socratic-sidebar-header">
        <div className="socratic-pulse-wrap">
          <div className="socratic-pulse-view">
            <DecisionPulse2D
              dqs={handoffInProgress ? 100 : readinessScore}
              runtimeActive={canInitiateBoardReview || isThinking || handoffInProgress || riskAlertPulseActive}
              mode={pulseMode}
              tugVector={tugVector}
              settling={settlingPulseActive}
              stable={canInitiateBoardReview}
            />
          </div>
          <div className="socratic-readiness">
            <span>Readiness Score</span>
            <strong>{readinessScore}%</strong>
          </div>
        </div>
      </header>

      {activeInquiry ? (
        <section className="socratic-active-inquiry">
          <h3>Active Socratic Inquiry</h3>
          <p>&ldquo;{activeInquiry}&rdquo;</p>
          <button type="button" onClick={onResearchActiveInquiry} disabled={!onResearchActiveInquiry}>
            Research via Tavily
          </button>
        </section>
      ) : null}

      {isRedTeamMode ? (
        <section className="socratic-risk-feed">
          <h3>Governance Blockers</h3>
          {riskPills.length === 0 ? (
            <p className="socratic-empty-state">No unresolved failure states detected right now.</p>
          ) : (
            <ul className="risk-pill-list">
              {riskPills.map((risk) => (
                <li key={risk.id}>
                  <RiskPill
                    id={risk.id}
                    riskTitle={risk.riskTitle}
                    description={risk.description}
                    riskLevel={risk.riskLevel}
                    resolved={risk.resolved}
                    resolvedMitigation={risk.resolvedMitigation}
                    onMitigate={(id, mitigationText) => onMitigateRisk?.(id, mitigationText)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section className="socratic-logic-feed">
        <h3>Detected Logic Gaps</h3>
        {logicGaps.length === 0 ? (
          <p className="socratic-empty-state">No unresolved logic gaps right now.</p>
        ) : (
          <ul>
            {logicGaps.map((gap) => (
              <li key={gap.id}>
                <button type="button" onClick={() => onFocusGap?.(gap.sectionKey)}>
                  {gap.text}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="socratic-research-feed">
        <h3>Evidence Clips</h3>
        {suggestedResearch.length === 0 ? (
          <p className="socratic-empty-state">No citations yet. Trigger research from the inquiry card.</p>
        ) : (
          <ul className="research-pill-list">
            {suggestedResearch.map((item) => (
              <li key={item.id}>
                <ResearchPill item={item} onSnap={onSnapResearch} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {canInitiateBoardReview ? (
        <section className="socratic-final-gate">
          <button type="button" onClick={onInitiateBoardReview}>
            INITIATE BOARD REVIEW
          </button>
        </section>
      ) : null}
    </aside>
  );
}
