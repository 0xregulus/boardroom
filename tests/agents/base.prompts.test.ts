import { describe, expect, it } from "vitest";

import { invalidReviewFallback, loadPrompts, renderTemplate } from "../../src/agents/base_utils/prompts";

describe("agents/base_utils/prompts", () => {
  it("loads configured prompts for known agents", async () => {
    const prompt = await loadPrompts("ceo");

    expect(prompt.systemMessage).toContain("Boardroom Executive Reviewer");
    expect(prompt.userTemplate).toContain("CEO perspective");
  });

  it("throws when a prompt definition is missing", async () => {
    await expect(loadPrompts("unknown-agent")).rejects.toThrow('Prompt definition not found for agent "unknown-agent"');
  });

  it("renders templates across repeated placeholders", () => {
    const rendered = renderTemplate("Hello {name}. {name} owns {team}.", {
      name: "Alex",
      team: "Finance",
    });

    expect(rendered).toBe("Hello Alex. Alex owns Finance.");
  });

  it("builds a deterministic fallback review payload", () => {
    const fallback = invalidReviewFallback("CFO", "Missing score");

    expect(fallback).toMatchObject({
      agent: "CFO",
      score: 1,
      confidence: 0,
      blocked: true,
      blockers: ["Invalid review output schema: Missing score"],
      required_changes: ["Regenerate review with strict JSON schema compliance."],
      apga_impact_view: "Unknown due to invalid review output.",
      governance_checks_met: {},
    });
    expect(fallback.risks).toHaveLength(1);
    expect(fallback.risks[0]?.type).toBe("schema_validation");
  });
});
