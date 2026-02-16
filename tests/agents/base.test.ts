import { describe, expect, it, vi } from "vitest";

import { ConfiguredChairpersonAgent, ConfiguredComplianceAgent, ConfiguredReviewAgent, safeJsonParse } from "../../src/agents/base";
import { LLMClient } from "../../src/llm/client";

function mockClient(responses: Array<string | Error>): LLMClient {
  const queue = [...responses];
  return {
    provider: "OpenAI",
    complete: vi.fn(async () => {
      const next = queue.shift();
      if (next instanceof Error) {
        throw next;
      }
      return next ?? "";
    }),
  };
}

const promptOverride = {
  systemMessage: "System",
  userTemplate: "snapshot={snapshot_json}\nmissing={missing_sections_str}\nfields={governance_checkbox_fields_str}\n",
};

describe("safeJsonParse", () => {
  it("parses direct JSON", () => {
    expect(safeJsonParse('{"a":1}')).toEqual({ a: 1 });
  });

  it("parses fenced JSON blocks", () => {
    expect(safeJsonParse("```json\n{\"ok\": true}\n```\n")).toEqual({ ok: true });
  });

  it("parses python-like object fallback", () => {
    expect(safeJsonParse("{'blocked': False, 'score': 7,}")).toEqual({ blocked: false, score: 7 });
  });

  it("returns null for invalid content", () => {
    expect(safeJsonParse("not-json")).toBeNull();
  });
});

describe("ConfiguredReviewAgent", () => {
  it("normalizes and validates review output", async () => {
    const client = mockClient([
      JSON.stringify({
        thesis: "Looks strong",
        score: "8",
        confidence: "70",
        blocked: "no",
        blockers: ["  ", "Need stress test"],
        risks: [{ category: "execution", severity: 12, description: "Capacity risk" }],
        required_revisions: "Add rollback plan;Add SLO",
        conditions: ["Stage rollout"],
        apgaImpactView: "Positive",
        governance_checks: {
          "Kill Criteria Defined": "yes",
          Unrelated: true,
        },
      }),
    ]);

    const agent = new ConfiguredReviewAgent("CEO", client, "gpt-4o-mini", 0.2, 1200, {
      promptOverride,
      provider: "OpenAI",
    });

    const result = await agent.evaluate({
      snapshot: { id: "d1" },
      memory_context: {
        missing_sections: ["Baseline"],
        governance_checkbox_fields: ["Kill Criteria Defined", "Problem Quantified"],
      },
    });

    expect(result.agent).toBe("CEO");
    expect(result.score).toBe(8);
    expect(result.confidence).toBe(0.7);
    expect(result.blocked).toBe(false);
    expect(result.risks[0]).toMatchObject({ type: "execution", severity: 10 });
    expect(result.required_changes).toEqual(["Add rollback plan", "Add SLO"]);
    expect(result.governance_checks_met).toEqual({ "Kill Criteria Defined": true });
  });

  it("returns placeholder when response is invalid", async () => {
    const client = mockClient(["unparseable"]);
    const agent = new ConfiguredReviewAgent("CEO", client, "gpt-4o-mini", 0.2, 1200, {
      promptOverride,
      provider: "OpenAI",
    });

    const result = await agent.evaluate({ snapshot: {}, memory_context: {} });

    expect(result.blocked).toBe(true);
    expect(result.score).toBe(1);
    expect(result.blockers[0]).toContain("JSON schema validation failed");
  });
});

describe("ConfiguredComplianceAgent", () => {
  it("retries once and succeeds on second response", async () => {
    const client = mockClient([
      "not-json",
      JSON.stringify({
        thesis: "Compliant with changes",
        score: 7,
        confidence: 0.9,
        blocked: false,
        blockers: [],
        risks: [],
        required_changes: ["Document retention policy"],
        approval_conditions: [],
        apga_impact_view: "Neutral",
        governance_checks_met: {},
      }),
    ]);

    const agent = new ConfiguredComplianceAgent(client, "gpt-4o-mini", 0.2, 500, {
      promptOverride,
      provider: "OpenAI",
    });

    const result = await agent.evaluate({ snapshot: {}, memory_context: {} });

    expect(result.blocked).toBe(false);
    expect(result.required_changes).toEqual(["Document retention policy"]);
    const completeMock = client.complete as unknown as ReturnType<typeof vi.fn>;
    expect(completeMock.mock.calls).toHaveLength(2);
  });

  it("returns placeholder when all attempts fail", async () => {
    const client = mockClient([new Error("timeout"), "still bad"]);
    const agent = new ConfiguredComplianceAgent(client, "gpt-4o-mini", 0.2, 500, {
      promptOverride,
      provider: "OpenAI",
    });

    const result = await agent.evaluate({ snapshot: {}, memory_context: {} });

    expect(result.blocked).toBe(true);
    expect(result.blockers[0]).toContain("after retry");
  });
});

describe("ConfiguredChairpersonAgent", () => {
  it("returns validated synthesis", async () => {
    const client = mockClient([
      JSON.stringify({
        executive_summary: "Proceed with safeguards",
        final_recommendation: "Approved",
        conflicts: [],
        blockers: [],
        required_revisions: ["Track downside scenario"],
      }),
    ]);

    const agent = new ConfiguredChairpersonAgent(client, "gpt-4o-mini", 0.2, 500, {
      promptOverride: {
        systemMessage: "System",
        userTemplate: "{reviews_json}",
      },
      provider: "OpenAI",
    });

    const result = await agent.evaluate({ snapshot: { reviews: [] }, memory_context: {} });

    expect(result.final_recommendation).toBe("Approved");
    expect(result.required_revisions).toEqual(["Track downside scenario"]);
  });

  it("falls back when synthesis payload is invalid", async () => {
    const client = mockClient(["{}"]); 
    const agent = new ConfiguredChairpersonAgent(client, "gpt-4o-mini", 0.2, 500, {
      promptOverride: {
        systemMessage: "System",
        userTemplate: "{reviews_json}",
      },
      provider: "OpenAI",
    });

    const result = await agent.evaluate({ snapshot: { reviews: [] }, memory_context: {} });

    expect(result.final_recommendation).toBe("Challenged");
    expect(result.executive_summary).toContain("failed");
  });
});
