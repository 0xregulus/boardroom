import { describe, expect, it } from "vitest";

import {
  appendSocraticAnswerToSection,
  buildSocraticArtifactQuestions,
  initialCreateStrategyDraft,
  sectionHasSocraticAnswer,
} from "../../src/features/boardroom/utils";

describe("socratic artifact assistant helpers", () => {
  it("builds contextual interview prompts from draft fields", () => {
    const draft = initialCreateStrategyDraft();
    draft.name = "BentoHub CRM Expansion";
    draft.capitalAllocation.investmentRequired = 50000;
    draft.coreProperties.primaryKpi = "Pipeline conversion";

    const questions = buildSocraticArtifactQuestions(draft);

    expect(questions).toHaveLength(6);
    expect(questions[0].prompt).toContain("BentoHub CRM Expansion");
    expect(questions[1].prompt).toContain("$50,000");
    expect(questions[2].prompt).toContain("Pipeline conversion");
    expect(questions[3].answerLabel).toContain("Pre-mortem");
    expect(questions[5].answerLabel).toContain("Resource competitor");
  });

  it("appends answers as structured bullets and avoids duplicates", () => {
    const base = "- Regulatory exposure:\n- Monitoring ownership:";
    const answerLabel = "Hygiene guardrail (privacy)";
    const answer = "Encrypt all PII at rest and purge inactive profiles after 30 days.";

    const appended = appendSocraticAnswerToSection(base, answerLabel, answer);
    expect(appended).toContain(`- ${answerLabel}: ${answer}`);

    const appendedAgain = appendSocraticAnswerToSection(appended, answerLabel, answer);
    expect(appendedAgain).toBe(appended);
    expect(sectionHasSocraticAnswer(appendedAgain, answerLabel)).toBe(true);
  });
});
