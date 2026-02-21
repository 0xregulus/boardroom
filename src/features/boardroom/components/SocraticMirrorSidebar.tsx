import { useMemo } from "react";

import { DecisionPulse } from "./DecisionPulse";
import type {
  DraftBoardAction,
  SocraticLiveFeedItem,
  SocraticPersona,
  SocraticResearchLink,
  SocraticSession,
  StrategicDecisionDocument,
} from "../types";

interface SocraticMirrorSidebarProps {
  session: SocraticSession;
  strategicDocument: StrategicDecisionDocument;
  liveFeed: SocraticLiveFeedItem[];
  activeSectionKey: string | null;
  isReadOnly: boolean;
  isObserving: boolean;
  isRedTeamMode: boolean;
  handoffInProgress: boolean;
  activeDraftBoardAction: DraftBoardAction | null;
  activePersona: SocraticPersona;
  researchLoadingSection: string | null;
  researchError: string | null;
  onFocusSection: (sectionKey: string) => void;
  onRequestResearch: (sectionKey: string) => void;
  onClipEvidence: (sectionKey: string, link: SocraticResearchLink) => void;
  onRunDraftBoardAction: (action: DraftBoardAction) => Promise<void>;
}

interface ResearchCard {
  sectionKey: string;
  link: SocraticResearchLink;
}

function flattenResearchCards(suggestions: Array<{ sectionKey: string; researchLinks: SocraticResearchLink[] }>): ResearchCard[] {
  const seen = new Set<string>();
  const cards: ResearchCard[] = [];
  for (const suggestion of suggestions) {
    for (const link of suggestion.researchLinks) {
      if (seen.has(link.url)) {
        continue;
      }
      seen.add(link.url);
      cards.push({
        sectionKey: suggestion.sectionKey,
        link,
      });
    }
  }
  return cards;
}

const SECTION_TUG_VECTOR: Record<string, [number, number]> = {
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

export function SocraticMirrorSidebar({
  session,
  strategicDocument,
  liveFeed,
  activeSectionKey,
  isReadOnly,
  isObserving,
  isRedTeamMode,
  handoffInProgress,
  activeDraftBoardAction,
  activePersona,
  researchLoadingSection,
  researchError,
  onFocusSection,
  onRequestResearch,
  onClipEvidence,
  onRunDraftBoardAction,
}: SocraticMirrorSidebarProps) {
  const scopedSuggestions = activeSectionKey
    ? session.suggestions.filter((suggestion) => suggestion.sectionKey === activeSectionKey)
    : session.suggestions;
  const visibleSuggestions = scopedSuggestions.length > 0 ? scopedSuggestions : session.suggestions;
  const researchCards = flattenResearchCards(visibleSuggestions).slice(0, 8);
  const showDiscoveryRound = !isReadOnly && session.confidenceScore < 55;
  const priorityInquirySectionKey = session.checklist.find((item) => item.status === "attention")?.sectionKey ?? null;
  const pulseInfluence = useMemo(() => {
    if (handoffInProgress) {
      return session.checklist.map(() => 0.82);
    }
    return session.checklist.map((item) => {
      if (item.status === "ready") {
        return 0.3;
      }
      if (item.status === "research") {
        return 0.62;
      }
      return 0.88;
    });
  }, [handoffInProgress, session.checklist]);
  const tugTargetSectionKey =
    handoffInProgress || isObserving
      ? null
      : priorityInquirySectionKey && priorityInquirySectionKey !== activeSectionKey
        ? priorityInquirySectionKey
        : activeSectionKey;
  const tugVector = tugTargetSectionKey ? SECTION_TUG_VECTOR[tugTargetSectionKey] ?? null : null;
  const inquiryModeLabel = handoffInProgress
    ? "Logic handoff to board sequence active."
    : isObserving
      ? "Analyzing current paragraph..."
      : priorityInquirySectionKey
        ? "Awaiting response to highest-priority inquiry."
        : "Observation synced.";

  return (
    <aside className={`mirror-sidebar${isRedTeamMode ? " red-team" : ""}${handoffInProgress ? " handoff" : ""}`} aria-label="Socratic mirror sidebar">
      <header className="mirror-sidebar-header">
        <div className="mirror-sidebar-kicker">Socratic Agent</div>
        <h3>The Mirror</h3>
        <p>Executive coaching for hygiene and substance quality before board review.</p>
        <div className="mirror-persona-card">
          <div className="mirror-persona-pulse" aria-hidden="true">
            <DecisionPulse
              dqs={handoffInProgress ? 98 : session.confidenceScore}
              readinessScore={handoffInProgress ? 100 : strategicDocument.metadata.readinessScore}
              agentInfluence={pulseInfluence}
              runtimeActive={handoffInProgress || isObserving}
              socraticMode={!handoffInProgress}
              socraticTug={tugVector}
            />
          </div>
          <strong>{activePersona.name}</strong>
          <span>{activePersona.stance}</span>
          <em>{inquiryModeLabel}</em>
        </div>
      </header>

      <section className="mirror-score-panel" aria-label="Socratic score">
        <div className="mirror-score-head">
          <span>Socratic Score</span>
          <strong>{session.confidenceScore}%</strong>
        </div>
        <div className="mirror-score-track" role="presentation">
          <span className="mirror-score-fill" style={{ width: `${session.confidenceScore}%` }} />
        </div>
        <div className="mirror-subscore-grid">
          <div>
            <span>Hygiene</span>
            <strong>{session.hygieneScore}%</strong>
          </div>
          <div>
            <span>Substance</span>
            <strong>{session.substanceScore}%</strong>
          </div>
        </div>
        <p>
          Thin sections: <strong>{session.thinSections.length}</strong>
        </p>
        <p>
          Schema readiness: <strong>{strategicDocument.metadata.readinessScore}%</strong>
        </p>
      </section>

      {showDiscoveryRound ? (
        <section className="mirror-discovery-panel" aria-label="Discovery round">
          <div className="mirror-panel-title">Discovery Round</div>
          <p>Start by stress-testing the idea before writing polished narrative.</p>
          <ol className="mirror-discovery-list">
            {session.discoveryQuestions.map((question) => (
              <li key={question.id}>
                <button type="button" onClick={() => onFocusSection(question.sectionKey)}>
                  {question.question}
                </button>
                <span>{question.placeholder}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="mirror-live-feed-panel" aria-label="Active inquiries feed">
        <div className="mirror-panel-title">Inquiry Feed</div>
        {liveFeed.length === 0 ? (
          <p className="mirror-research-empty">No logic gaps detected right now.</p>
        ) : (
          <ul className="mirror-live-feed-list">
            {liveFeed.slice(0, 8).map((item) => (
              <li key={item.id} className={`mirror-inquiry-card${item.sectionKey === activeSectionKey ? " active" : ""}`}>
                <span>{item.section}</span>
                <p>{item.message}</p>
                <div className="mirror-inquiry-actions">
                  <button type="button" onClick={() => onFocusSection(item.sectionKey)}>
                    Highlight gap
                  </button>
                  <button
                    type="button"
                    onClick={() => onRequestResearch(item.sectionKey)}
                    disabled={researchLoadingSection === item.sectionKey}
                  >
                    {researchLoadingSection === item.sectionKey ? "Verifying..." : "Verify via Tavily"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mirror-interventions-panel" aria-label="Socratic interventions">
        <div className="mirror-panel-title">Thin Section Interventions</div>
        <div className="mirror-interventions-list">
          {visibleSuggestions.map((suggestion) => {
            const isResearchLoading = researchLoadingSection === suggestion.sectionKey;
            return (
              <article
                key={suggestion.id}
                className={`mirror-intervention-card ${suggestion.isThinSection ? "thin" : "ready"}`}
              >
                <div className="mirror-intervention-head">
                  <span>{suggestion.sectionTitle}</span>
                  <em>{suggestion.isThinSection ? "Thin" : "Tracked"}</em>
                </div>
                <p className="mirror-intervention-question">{suggestion.question}</p>
                <p className="mirror-intervention-rationale">{suggestion.rationale}</p>
                <div className="mirror-intervention-actions">
                  <button type="button" onClick={() => onFocusSection(suggestion.sectionKey)}>
                    Open section
                  </button>
                  <button type="button" onClick={() => onRequestResearch(suggestion.sectionKey)} disabled={isResearchLoading}>
                    {isResearchLoading ? "Researching..." : "Find evidence"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mirror-draft-board-panel" aria-label="Draft board actions">
        <div className="mirror-panel-title">Draft Board</div>
        <div className="mirror-draft-board-actions">
          <button
            type="button"
            className={activeDraftBoardAction === "simulate_red_team" ? "active" : ""}
            onClick={() => onRunDraftBoardAction("simulate_red_team")}
            disabled={isObserving || handoffInProgress}
          >
            Simulate Red Team
          </button>
          <button
            type="button"
            className={activeDraftBoardAction === "verify_assumptions" ? "active" : ""}
            onClick={() => onRunDraftBoardAction("verify_assumptions")}
            disabled={isObserving || handoffInProgress}
          >
            Verify Assumptions
          </button>
        </div>
        <p className="mirror-draft-board-note">{strategicDocument.socratic_layer.active_inquiry}</p>
      </section>

      <section className="mirror-checklist-panel" aria-label="Governance checklist">
        <div className="mirror-panel-title">Governance Checklist</div>
        <div className="mirror-checklist-grid" role="table" aria-label="Section logic checklist">
          <div className="mirror-checklist-head" role="row">
            <span role="columnheader">Status</span>
            <span role="columnheader">Section</span>
            <span role="columnheader">Socratic Prompt</span>
          </div>
          {session.checklist.slice(0, 8).map((item) => (
            <button
              key={item.sectionKey}
              type="button"
              role="row"
              className={`mirror-checklist-row status-${item.status}`}
              onClick={() => onFocusSection(item.sectionKey)}
            >
              <span role="cell">{item.status === "ready" ? "✅" : item.status === "research" ? "🔍" : "⚠️"}</span>
              <span role="cell">{item.sectionTitle}</span>
              <span role="cell">{item.prompt}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="mirror-research-panel" aria-label="Research sidebar">
        <div className="mirror-panel-title">Research Cards</div>
        {researchError ? <p className="mirror-research-error">{researchError}</p> : null}
        {researchCards.length === 0 ? (
          <p className="mirror-research-empty">
            No citations yet. Trigger research from an intervention to load live context links.
          </p>
        ) : (
          <ul className="mirror-research-list">
            {researchCards.map((card) => (
              <li key={card.link.url}>
                <span className="mirror-research-section">{card.sectionKey}</span>
                <a href={card.link.url} target="_blank" rel="noreferrer">
                  {card.link.title}
                </a>
                {card.link.publishedDate ? <span>{card.link.publishedDate}</span> : null}
                <p>{card.link.snippet}</p>
                <button
                  type="button"
                  className="mirror-research-clip"
                  onClick={() => onClipEvidence(card.sectionKey, card.link)}
                >
                  Clip into document
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
