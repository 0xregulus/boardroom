import { useMemo, useState } from "react";

import type {
  CreateStrategyDraft,
  DraftCapitalAllocation,
  DraftCoreProperties,
  DraftRiskProperties,
} from "../types";
import { CreateStrategyArtifactSections } from "./CreateStrategyArtifactSections";
import { CreateStrategyConfigPanels } from "./CreateStrategyConfigPanels";
import {
  appendSocraticAnswerToSection,
  buildSocraticArtifactQuestions,
  sectionHasSocraticAnswer,
} from "../utils";

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
  onRunAnalysis: () => void;
  onCancel: () => void;
  onSave: () => void;
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
  onRunAnalysis,
  onCancel,
  onSave,
}: CreateStrategyStageProps) {
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [draftAnswers, setDraftAnswers] = useState<Record<string, string>>({});
  const socraticQuestions = useMemo(() => buildSocraticArtifactQuestions(createDraft), [createDraft]);
  const safeIndex = Math.max(0, Math.min(activeQuestionIndex, Math.max(0, socraticQuestions.length - 1)));
  const activeQuestion = socraticQuestions[safeIndex];
  const answeredQuestionIds = useMemo(
    () =>
      socraticQuestions
        .filter((question) => sectionHasSocraticAnswer(createDraft.sections[question.sectionKey] ?? "", question.answerLabel))
        .map((question) => question.id),
    [createDraft.sections, socraticQuestions],
  );
  const answeredSet = useMemo(() => new Set(answeredQuestionIds), [answeredQuestionIds]);
  const unansweredCount = socraticQuestions.length - answeredQuestionIds.length;
  const canSave = isCreateReadOnly || unansweredCount === 0;

  const applySocraticAnswer = (questionId: string): void => {
    const question = socraticQuestions.find((entry) => entry.id === questionId);
    if (!question) {
      return;
    }

    const answer = (draftAnswers[questionId] ?? "").trim();
    if (answer.length === 0) {
      return;
    }

    const currentSection = createDraft.sections[question.sectionKey] ?? "";
    const nextSection = appendSocraticAnswerToSection(currentSection, question.answerLabel, answer);
    if (nextSection !== currentSection) {
      onUpdateSection(question.sectionKey, nextSection);
    }

    setDraftAnswers((prev) => ({
      ...prev,
      [questionId]: "",
    }));

    const nextPending = socraticQuestions.findIndex((entry) => {
      if (entry.id === questionId) {
        return false;
      }
      return !sectionHasSocraticAnswer(createDraft.sections[entry.sectionKey] ?? "", entry.answerLabel);
    });
    if (nextPending >= 0) {
      setActiveQuestionIndex(nextPending);
    }
  };

  return (
    <section className="create-strategy-stage">
      <div className="create-reference-frame">
        <article className="create-reference-card">
          <div className="create-reference-body">
            <div className="create-reference-top">
              <div className="create-reference-target-wrap" aria-hidden="true">
                <span className="create-reference-target">◉</span>
              </div>
              <div className="create-reference-version">Strategic Decision / v2.4</div>
            </div>

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

            {!isCreateReadOnly && activeQuestion ? (
              <article className="create-section" aria-label="Socratic artifact assistant">
                <h3>
                  <span>Q</span>
                  Socratic Assistant
                </h3>
                <p>
                  Interview progress: {answeredQuestionIds.length}/{socraticQuestions.length} answered.
                  {unansweredCount > 0 ? ` ${unansweredCount} remaining before save.` : " Ready to save."}
                </p>
                <p>{activeQuestion.prompt}</p>
                <textarea
                  value={draftAnswers[activeQuestion.id] ?? ""}
                  onChange={(event) =>
                    setDraftAnswers((prev) => ({
                      ...prev,
                      [activeQuestion.id]: event.target.value,
                    }))
                  }
                  className="create-section-textarea"
                  rows={3}
                  placeholder={activeQuestion.placeholder}
                />
                <p>{activeQuestion.helperText}</p>
                <p>
                  Status: {answeredSet.has(activeQuestion.id) ? "Answer captured in target section." : "Awaiting answer."}
                </p>
                <div className="create-strategy-footer-actions">
                  <button
                    type="button"
                    className="create-cancel-button"
                    onClick={() => setActiveQuestionIndex((prev) => Math.max(0, prev - 1))}
                    disabled={safeIndex === 0}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="create-cancel-button"
                    onClick={() => setActiveQuestionIndex((prev) => Math.min(socraticQuestions.length - 1, prev + 1))}
                    disabled={safeIndex >= socraticQuestions.length - 1}
                  >
                    Next
                  </button>
                  <button
                    type="button"
                    className="create-save-button"
                    onClick={() => applySocraticAnswer(activeQuestion.id)}
                    disabled={(draftAnswers[activeQuestion.id] ?? "").trim().length === 0}
                  >
                    Append Answer
                  </button>
                </div>
              </article>
            ) : null}

            <CreateStrategyArtifactSections
              createDraft={createDraft}
              isCreateReadOnly={isCreateReadOnly}
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
                  <button
                    type="button"
                    className="create-save-button"
                    onClick={onSave}
                    disabled={!canSave}
                    title={!canSave ? "Complete all Socratic assistant prompts before saving." : undefined}
                  >
                    Save
                  </button>
                  <button type="button" className="create-cancel-button" onClick={onCancel}>
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
    </section>
  );
}
