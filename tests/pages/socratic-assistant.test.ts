import { describe, expect, it } from "vitest";

import {
  appendSocraticAnswerToSection,
  buildSocraticSession,
  buildSocraticArtifactQuestions,
  buildSocraticLiveFeed,
  buildStrategicDecisionDocument,
  initialCreateStrategyDraft,
  isSocraticSessionBoardReady,
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

  it("derives a session score, thin sections, and ghost prompts from the draft", () => {
    const draft = initialCreateStrategyDraft();
    draft.name = "Retention OS";
    draft.sections.problemFraming = "- Root cause: onboarding drop-off in enterprise cohort by 22%.";
    draft.sections.financialModel =
      "- 12-month revenue impact: $600,000.\n- Margin effects: +4 points.\n- Payback period: 9 months.\n- Assumptions: CAC stable.";
    draft.sections.finalDecision =
      "- Chosen option: Option B.\n- Explicit trade-offs: slower release velocity for higher gross retention moat.";

    const session = buildSocraticSession(draft);

    expect(session.confidenceScore).toBeGreaterThan(0);
    expect(session.hygieneScore).toBeLessThan(50);
    expect(session.thinSections).toContain("downsideModel");
    expect(session.suggestions.some((entry) => entry.sectionKey === "problemFraming")).toBe(true);
    expect(session.suggestions.some((entry) => entry.pillar === "Viability")).toBe(true);
    expect(session.checklist.length).toBeGreaterThan(0);
    expect(session.checklist.some((entry) => entry.status === "attention")).toBe(true);
    expect(session.ghostTextBySection.problemFraming).toContain("Mirror");
    expect(session.personaBySection.financialModel.name).toContain("CFO");
    expect(isSocraticSessionBoardReady(session)).toBe(false);
  });

  it("builds a strategic decision schema with evidence and socratic layer", () => {
    const draft = initialCreateStrategyDraft();
    draft.name = "Ops Automation Program";
    draft.owner = "User_01";
    draft.coreProperties.strategicObjective = "Reduce cost through automation and efficiency.";
    draft.sections.problemFraming = "- Root cause: 18% fulfillment delays caused by manual queueing.";
    draft.sections.financialModel =
      "- Assumption: CAC remains flat at $120.\n- Payback period: 8 months.\n- Margin uplift: 3 points.";
    draft.sections.downsideModel = "- Critical failure mode: platform-wide data loss.";
    draft.sections.killCriteria = "- Revert to legacy pipeline within 24 hours.";
    draft.sections.complianceMonitoring = "- GDPR and CCPA controls with quarterly privacy audits.";
    draft.capitalAllocation.investmentRequired = 250000;
    draft.capitalAllocation.grossBenefit12m = 620000;
    draft.capitalAllocation.probabilityOfSuccess = "65%";

    const session = buildSocraticSession(draft);
    const document = buildStrategicDecisionDocument(draft, session, {
      action: "verify_assumptions",
      clippedEvidenceBySection: {
        problemFraming: [
          {
            title: "Industry CAC benchmark 2026",
            url: "https://example.com/cac",
            snippet: "Benchmark CAC ranges between $90 and $140.",
            publishedDate: "2026-01-01",
          },
        ],
      },
    });

    expect(document.metadata.title).toBe("Ops Automation Program");
    expect(document.metadata.owner).toBe("User_01");
    expect(document.metadata.version).toBe("1.0");
    expect(document.metadata.readinessScore).toBe(Math.round(session.confidenceScore));
    expect(document.sections.problem_statement.evidence_slots).toHaveLength(1);
    expect(document.sections.problem_statement.evidence_slots[0]?.link).toBe("https://example.com/cac");
    expect(document.sections.economic_logic.value_driver).toBe("Efficiency");
    expect(document.sections.economic_logic.base_assumptions.length).toBeGreaterThan(0);
    expect(document.sections.downside_modeling.blast_radius).toBe("High");
    expect(document.sections.governance_compliance.data_privacy).toBe(true);
    expect(document.socratic_layer.active_inquiry).toContain("sensitivity");
    expect(document.socratic_layer.suggested_research.length).toBeGreaterThan(0);
    expect(document.socratic_layer.red_team_critique.length).toBeGreaterThan(0);
  });

  it("builds a live feed from logic gaps and checklist prompts", () => {
    const draft = initialCreateStrategyDraft();
    draft.sections.problemFraming = "Improve experience.";

    const session = buildSocraticSession(draft);
    const document = buildStrategicDecisionDocument(draft, session);
    const feed = buildSocraticLiveFeed(document, session);

    expect(feed.length).toBeGreaterThan(0);
    expect(feed.some((item) => item.sectionKey === "problemFraming")).toBe(true);
    expect(feed.some((item) => item.message.length > 0)).toBe(true);
  });
});
