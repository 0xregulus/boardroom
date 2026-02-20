import { useEffect, useMemo, useState } from "react";

import type { CreateStrategyDraft, SocraticArtifactQuestion } from "../types";
import {
  appendSocraticAnswerToSection,
  buildSocraticArtifactQuestions,
  sectionHasSocraticAnswer,
} from "../utils";

interface CreateStrategySocraticAssistantProps {
  createDraft: CreateStrategyDraft;
  isCreateReadOnly: boolean;
  onUpdateSection: (sectionKey: string, value: string) => void;
}

function nextQuestionIndex(
  questions: SocraticArtifactQuestion[],
  startIndex: number,
  completionByQuestionId: Record<string, boolean>,
): number {
  for (let index = startIndex + 1; index < questions.length; index += 1) {
    const question = questions[index];
    if (!completionByQuestionId[question.id]) {
      return index;
    }
  }
  return Math.min(startIndex, Math.max(questions.length - 1, 0));
}

export function CreateStrategySocraticAssistant({
  createDraft,
  isCreateReadOnly,
  onUpdateSection,
}: CreateStrategySocraticAssistantProps) {
  const questions = useMemo(
    () => buildSocraticArtifactQuestions(createDraft),
    [createDraft],
  );

  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [draftAnswer, setDraftAnswer] = useState("");
  const [answerByQuestionId, setAnswerByQuestionId] = useState<Record<string, string>>({});

  const completionByQuestionId = useMemo(() => {
    const completion: Record<string, boolean> = {};
    for (const question of questions) {
      const sectionValue = createDraft.sections[question.sectionKey] ?? "";
      completion[question.id] = sectionHasSocraticAnswer(sectionValue, question.answerLabel);
    }
    return completion;
  }, [createDraft.sections, questions]);

  const completedCount = useMemo(
    () => questions.filter((question) => completionByQuestionId[question.id]).length,
    [completionByQuestionId, questions],
  );

  useEffect(() => {
    setActiveQuestionIndex((previous) => {
      if (questions.length === 0) {
        return 0;
      }
      return Math.min(Math.max(previous, 0), questions.length - 1);
    });
  }, [questions.length]);

  const activeQuestion = questions[activeQuestionIndex] ?? null;

  useEffect(() => {
    if (!activeQuestion) {
      setDraftAnswer("");
      return;
    }

    setDraftAnswer(answerByQuestionId[activeQuestion.id] ?? "");
  }, [activeQuestion, answerByQuestionId]);

  function saveAnswer(): void {
    if (isCreateReadOnly || !activeQuestion) {
      return;
    }

    const normalizedAnswer = draftAnswer.trim();
    if (normalizedAnswer.length === 0) {
      return;
    }

    const currentSectionValue = createDraft.sections[activeQuestion.sectionKey] ?? "";
    const nextSectionValue = appendSocraticAnswerToSection(
      currentSectionValue,
      activeQuestion.answerLabel,
      normalizedAnswer,
    );
    onUpdateSection(activeQuestion.sectionKey, nextSectionValue);
    setAnswerByQuestionId((previous) => ({
      ...previous,
      [activeQuestion.id]: normalizedAnswer,
    }));
    setActiveQuestionIndex((previous) =>
      nextQuestionIndex(questions, previous, {
        ...completionByQuestionId,
        [activeQuestion.id]: true,
      }),
    );
  }

  function moveQuestion(step: number): void {
    if (questions.length === 0) {
      return;
    }

    setActiveQuestionIndex((previous) => {
      const next = previous + step;
      if (next < 0) {
        return 0;
      }
      if (next > questions.length - 1) {
        return questions.length - 1;
      }
      return next;
    });
  }

  return (
    <section className="create-assistant-panel" aria-label="Socratic artifact assistant">
      <div className="create-assistant-head">
        <div className="create-assistant-kicker">Socratic Artifact Assistant</div>
        <h3>Interview Mode</h3>
        <p>
          Answer targeted governance questions. Each answer is appended to the correct artifact section so the decision
          memo is production-ready before review.
        </p>
      </div>

      {activeQuestion ? (
        <article className="create-assistant-card">
          <div className="create-assistant-progress">
            <span>
              Question {activeQuestionIndex + 1} / {questions.length}
            </span>
            <strong>{completedCount} captured</strong>
          </div>

          <p className="create-assistant-question">{activeQuestion.prompt}</p>
          <p className="create-assistant-helper">{activeQuestion.helperText}</p>

          <textarea
            className="create-assistant-answer"
            rows={4}
            value={draftAnswer}
            onChange={(event) => setDraftAnswer(event.target.value)}
            placeholder={activeQuestion.placeholder}
            readOnly={isCreateReadOnly}
          />

          <div className="create-assistant-actions">
            <button
              type="button"
              className="create-assistant-nav-button"
              onClick={() => moveQuestion(-1)}
              disabled={activeQuestionIndex === 0}
            >
              Previous
            </button>
            <button
              type="button"
              className="create-assistant-nav-button"
              onClick={() => moveQuestion(1)}
              disabled={activeQuestionIndex >= questions.length - 1}
            >
              Next
            </button>
            <button
              type="button"
              className="create-assistant-save-button"
              onClick={saveAnswer}
              disabled={isCreateReadOnly || draftAnswer.trim().length === 0}
            >
              {completionByQuestionId[activeQuestion.id] ? "Update answer" : "Save answer"}
            </button>
          </div>
        </article>
      ) : null}

      <ul className="create-assistant-question-list" aria-label="Socratic question checklist">
        {questions.map((question, index) => {
          const completed = completionByQuestionId[question.id];
          return (
            <li key={question.id} className={completed ? "complete" : ""}>
              <button
                type="button"
                className={activeQuestionIndex === index ? "active" : ""}
                onClick={() => setActiveQuestionIndex(index)}
              >
                {question.answerLabel}
              </button>
              <span>{completed ? "Captured" : "Open"}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
