import { STRATEGIC_ARTIFACT_SECTIONS } from "../constants";
import type {
  CreateStrategyDraft,
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
  onUpdateSection: (sectionKey: string, value: string) => void;
}

export function CreateStrategyArtifactSections({
  createDraft,
  isCreateReadOnly,
  onUpdateSection,
}: CreateStrategyArtifactSectionsProps) {
  return (
    <section className="create-sections" aria-label="Strategic decision template sections">
      <article className="create-section">
        <h3>
          <span>#</span>
          Executive Summary
        </h3>
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

        return (
          <article key={section.key} className="create-section">
            <h3>
              <span>{index + 1}.</span>
              {section.title}
            </h3>
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
                className="create-section-textarea"
                rows={7}
                readOnly={isCreateReadOnly}
              />
            )}
          </article>
        );
      })}
    </section>
  );
}
