import { STRATEGIC_ARTIFACT_SECTIONS } from "../constants";
import type {
  CreateStrategyDraft,
  SocraticChecklistItem,
  StrategicSectionTemplate,
} from "../types";
import { isMatrixSectionKey, isSerializedSectionMatrix } from "../utils";
import { SectionMatrixEditor, SectionMatrixView } from "./section-matrix";

const CREATE_DOCUMENT_SECTIONS: StrategicSectionTemplate[] = STRATEGIC_ARTIFACT_SECTIONS.filter(
  (section) => section.key !== "executiveSummary",
);

interface CreateStrategyArtifactSectionsProps {
  createDraft: CreateStrategyDraft;
  isCreateReadOnly: boolean;
  activeSectionKey: string | null;
  highlightedSectionKey: string | null;
  isRedTeamMode: boolean;
  sectionReadinessByKey: Record<string, number>;
  checklist: SocraticChecklistItem[];
  ghostTextBySection: Record<string, string>;
  onSectionFocus: (sectionKey: string) => void;
  onUpdateSection: (sectionKey: string, value: string) => void;
}

export function CreateStrategyArtifactSections({
  createDraft,
  isCreateReadOnly,
  activeSectionKey,
  highlightedSectionKey,
  isRedTeamMode,
  sectionReadinessByKey,
  checklist,
  ghostTextBySection,
  onSectionFocus,
  onUpdateSection,
}: CreateStrategyArtifactSectionsProps) {
  const checklistBySection = checklist.reduce<Record<string, SocraticChecklistItem>>((acc, item) => {
    acc[item.sectionKey] = item;
    return acc;
  }, {});

  function statusIcon(sectionKey: string): string {
    const status = checklistBySection[sectionKey]?.status ?? "attention";
    if (status === "ready") {
      return "✅";
    }
    if (status === "research") {
      return "🔍";
    }
    return "⚠️";
  }

  function readinessLabel(sectionKey: string): string {
    const readiness = Math.round((sectionReadinessByKey[sectionKey] ?? 0) * 100);
    return `${readiness}% ready`;
  }

  return (
    <section className="create-sections" aria-label="Strategic decision template sections">
      <article id="section-executiveSummary" className="create-section" onFocusCapture={() => onSectionFocus("executiveSummary")}>
        <h3>
          <span>#</span>
          Executive Summary
        </h3>
        {!isCreateReadOnly && activeSectionKey === "executiveSummary" && ghostTextBySection.executiveSummary ? (
          <p className="create-section-ghost">{ghostTextBySection.executiveSummary}</p>
        ) : null}
        <textarea
          value={createDraft.sections.executiveSummary ?? ""}
          onChange={(event) => onUpdateSection("executiveSummary", event.target.value)}
          className="create-section-textarea create-section-textarea-summary"
          rows={4}
          placeholder="One-paragraph decision rationale and expected impact."
          readOnly={isCreateReadOnly}
        />
        <div className="create-section-divider" aria-hidden="true" />
      </article>

      {CREATE_DOCUMENT_SECTIONS.map((section, index) => {
        const sectionValue = createDraft.sections[section.key] ?? "";
        const matrixSectionKey = isMatrixSectionKey(section.key) ? section.key : null;
        const hasStructuredMatrix = matrixSectionKey ? isSerializedSectionMatrix(sectionValue) : false;
        const checklistItem = checklistBySection[section.key];
        const isActiveSection = activeSectionKey === section.key;
        const isHighlightedSection = highlightedSectionKey === section.key;
        const governanceStatus = checklistItem?.status ?? "attention";
        const isRedTeamWeakness = isRedTeamMode && governanceStatus !== "ready";

        return (
          <article
            id={`section-${section.key}`}
            key={section.key}
            className={`create-section create-governance-block governance-${governanceStatus}${isActiveSection ? " active" : ""}${
              isHighlightedSection ? " gap-highlight" : ""
            }${isRedTeamWeakness ? " red-team-focus" : ""}`}
            onFocusCapture={() => onSectionFocus(section.key)}
          >
            <div className={`create-governance-main${isRedTeamWeakness ? " red-team-weakness" : ""}`}>
              <h3>
                <span>{index + 1}.</span>
                {section.title}
              </h3>
              <div className="create-governance-meta">
                <span className="create-governance-status">
                  {statusIcon(section.key)}{" "}
                  {checklistItem?.pillar ?? "Integrity"}
                </span>
                <span className="create-governance-readiness">{readinessLabel(section.key)}</span>
              </div>
              {!isCreateReadOnly && isActiveSection && ghostTextBySection[section.key] ? (
                <p className="create-section-ghost">{ghostTextBySection[section.key]}</p>
              ) : null}
            </div>

            <div className={`create-governance-input-row${isRedTeamWeakness ? " red-team-weakness" : ""}`}>
              <div className={`create-section-input-wrap${isRedTeamWeakness ? " red-team-weakness" : ""}`}>
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
                      onChange={(nextValue) => onUpdateSection(section.key, nextValue)}
                    />
                  )
                ) : (
                  <textarea
                    value={sectionValue}
                    onChange={(event) => onUpdateSection(section.key, event.target.value)}
                    className={`create-section-textarea${isRedTeamWeakness ? " red-team-weakness" : ""}`}
                    rows={7}
                    readOnly={isCreateReadOnly}
                  />
                )}
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
