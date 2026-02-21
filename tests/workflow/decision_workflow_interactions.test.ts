import { describe, expect, it } from "vitest";

import type { AgentConfig } from "../../src/config/agent_config";
import type { ReviewOutput } from "../../src/schemas/review_output";
import {
  buildInteractionDeltas,
  buildPeerReviewContext,
  summarizeInteractionRound,
} from "../../src/workflow/decision_workflow_interactions";

function review(overrides: Partial<ReviewOutput> = {}): ReviewOutput {
  return {
    agent: "Agent",
    thesis: "Thesis",
    score: 5,
    confidence: 0.7,
    blocked: false,
    blockers: ["b1", "b2", "b3", "b4"],
    risks: [
      { type: "risk-1", severity: 3, evidence: "e1" },
      { type: "risk-2", severity: 4, evidence: "e2" },
      { type: "risk-3", severity: 5, evidence: "e3" },
      { type: "risk-4", severity: 6, evidence: "e4" },
    ],
    citations: [],
    required_changes: ["c1", "c2", "c3", "c4"],
    approval_conditions: [],
    apga_impact_view: "Neutral",
    governance_checks_met: {},
    ...overrides,
  };
}

function config(id: string, name = `${id}-name`): AgentConfig {
  return {
    id,
    role: id.toUpperCase(),
    name,
    systemMessage: "sys",
    userMessage: "user",
    provider: "OpenAI",
    model: "gpt-4o-mini",
    temperature: 0.3,
    maxTokens: 1000,
  };
}

describe("buildPeerReviewContext", () => {
  it("excludes current agent and truncates arrays to top three items", () => {
    const result = buildPeerReviewContext(
      {
        ceo: review({ agent: "CEO", score: 8 }),
        cfo: review({ agent: "CFO", score: 6 }),
      },
      "cfo",
    );

    expect(result).toEqual([
      {
        agent_id: "ceo",
        agent: "CEO",
        score: 8,
        blocked: false,
        thesis: "Thesis",
        blockers: ["b1", "b2", "b3"],
        risks: [
          { type: "risk-1", severity: 3, evidence: "e1" },
          { type: "risk-2", severity: 4, evidence: "e2" },
          { type: "risk-3", severity: 5, evidence: "e3" },
        ],
        required_changes: ["c1", "c2", "c3"],
      },
    ]);
  });
});

describe("buildInteractionDeltas", () => {
  it("returns only changed deltas and falls back to config name when revised agent name is empty", () => {
    const previous = {
      ceo: review({ score: 7, blocked: false }),
      cfo: review({ score: 6, blocked: false }),
      cto: review({ score: 5, blocked: false }),
    };
    const revised = {
      ceo: review({ agent: "", score: 8, blocked: true }),
      cfo: review({ score: 6, blocked: false }),
    };

    const result = buildInteractionDeltas(previous, revised, [config("ceo", "Chief Exec"), config("cfo"), config("cto")]);

    expect(result).toEqual([
      {
        agent_id: "ceo",
        agent_name: "Chief Exec",
        previous_score: 7,
        revised_score: 8,
        score_delta: 1,
        previous_blocked: false,
        revised_blocked: true,
      },
    ]);
  });
});

describe("summarizeInteractionRound", () => {
  it("summarizes no changes", () => {
    expect(summarizeInteractionRound(3, [])).toBe("Round 3: no review score or block-status changes.");
  });

  it("summarizes score and block-status changes", () => {
    const summary = summarizeInteractionRound(2, [
      {
        agent_id: "a1",
        agent_name: "A1",
        previous_score: 5,
        revised_score: 6,
        score_delta: 1,
        previous_blocked: false,
        revised_blocked: false,
      },
      {
        agent_id: "a2",
        agent_name: "A2",
        previous_score: 7,
        revised_score: 7,
        score_delta: 0,
        previous_blocked: false,
        revised_blocked: true,
      },
      {
        agent_id: "a3",
        agent_name: "A3",
        previous_score: 8,
        revised_score: 6,
        score_delta: -2,
        previous_blocked: true,
        revised_blocked: false,
      },
    ]);

    expect(summary).toBe("Round 2: 2 score changes, 2 block-status changes, 1 new blocks.");
  });
});
