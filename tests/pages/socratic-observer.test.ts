import { describe, expect, it } from "vitest";

import {
  applySocraticAgentOutput,
  deriveQuantifiableClaimResearchQueries,
  parseSocraticAgentOutput,
} from "../../src/features/boardroom/socratic_observer";
import { buildSocraticSession, buildStrategicDecisionDocument, initialCreateStrategyDraft } from "../../src/features/boardroom/utils";

describe("socratic observer helpers", () => {
  it("parses normalized socratic output and filters invalid logic-gap sections", () => {
    const parsed = parseSocraticAgentOutput(
      JSON.stringify({
      socratic_layer: {
        active_inquiry: "How might CAC volatility impact payback timing?",
        suggested_research: ["SaaS CAC benchmark 2026"],
        red_team_critique: "Counter-case: CAC inflation erodes ROI assumptions.",
        risk_pills: [],
      },
        logic_gaps: [
          {
            section_key: "financialModel",
            section_title: "Financial Model",
            gap: "Missing CAC threshold for profitability.",
          },
          {
            section_key: "unknownSection",
            section_title: "Unknown",
            gap: "Should be dropped.",
          },
        ],
      }),
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.socratic_layer.logic_gaps).toHaveLength(1);
    expect(parsed?.socratic_layer.logic_gaps[0]?.section_key).toBe("financialModel");
    expect(parsed?.socratic_layer.logic_gaps[0]?.gap_type).toBe("Hygiene");
  });

  it("applies observer output into strategic document and merges section-aware logic gaps", () => {
    const draft = initialCreateStrategyDraft();
    draft.sections.problemFraming = "We expect 25% growth from enterprise expansion.";
    draft.sections.financialModel = "- Revenue target: $2M.\n- CAC estimate: unknown.";

    const session = buildSocraticSession(draft);
    const baseDocument = buildStrategicDecisionDocument(draft, session);
    const nextDocument = applySocraticAgentOutput(baseDocument, draft, {
      socratic_layer: {
        active_inquiry: "How might CAC uncertainty shift your capital plan?",
        suggested_research: ["Enterprise CAC benchmark SaaS 2026"],
        red_team_critique: "Counter-case: growth target assumes underpriced acquisition.",
        risk_pills: [
          {
            section_key: "financialModel",
            section_title: "Financial Model",
            risk_title: "Financial Model",
            description: "Missing CAC threshold tied to payback constraints.",
            risk_level: "Critical",
          },
        ],
        logic_gaps: [
          {
            section_key: "financialModel",
            section_title: "Financial Model",
            gap: "Missing CAC threshold tied to payback constraints.",
            gap_type: "Hygiene",
          },
        ],
      },
    });

    expect(nextDocument.socratic_layer.active_inquiry).toContain("CAC uncertainty");
    expect(nextDocument.socratic_layer.suggested_research.length).toBeGreaterThan(0);
    expect(nextDocument.socratic_layer.logic_gaps).toHaveLength(1);
    expect(
      nextDocument.sections.problem_statement.logic_gaps.some((gap) =>
        gap.includes("Financial Model: Missing CAC threshold tied to payback constraints."),
      ),
    ).toBe(true);
  });

  it("derives quantifiable-claim queries when numeric market assertions are present", () => {
    const draft = initialCreateStrategyDraft();
    draft.sections.problemFraming = "We will reach 1M users and 25% market share in Year 2.";
    draft.sections.financialModel = "- Revenue will grow 40% with $500K spend.";

    const queries = deriveQuantifiableClaimResearchQueries(draft);

    expect(queries.length).toBeGreaterThan(0);
    expect(queries.some((query) => query.toLowerCase().includes("problem framing"))).toBe(true);
  });
});
