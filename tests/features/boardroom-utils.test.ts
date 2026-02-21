import { afterEach, describe, expect, it, vi } from "vitest";

import { agentModelMeta, resolveAgentChessPiece, serializeAgentConfigs, sleep } from "../../src/features/boardroom/utils/agent-utils";
import { firstLine, formatCurrency, formatDqs, formatRunTimestamp } from "../../src/features/boardroom/utils/formatting";
import {
  buildInitialNodes,
  buildInteractionTasks,
  buildReviewTasks,
  edgePathData,
  strategyStatusTone,
} from "../../src/features/boardroom/utils/workflow-graph";
import {
  asBoolean,
  asBooleanMap,
  asNumber,
  asRecord,
  asString,
  asStringArray,
  asStringArrayMap,
  firstPresentValue,
  parseCurrencyAmount,
  parseSerializedValue,
} from "../../src/features/boardroom/utils/parsing";
import {
  extractGovernanceRows,
  extractSnapshotMetrics,
  recommendationForState,
  recommendationTone,
  sortReviews,
} from "../../src/features/boardroom/utils/workflow-state";

afterEach(() => {
  vi.useRealTimers();
});

describe("features/boardroom utils", () => {
  it("handles agent utility helpers", async () => {
    const serialized = serializeAgentConfigs([
      {
        id: "ceo",
        role: "CEO",
        name: "CEO Agent",
        systemMessage: "system",
        userMessage: "user",
        provider: "OpenAI",
        model: "gpt-4o",
        temperature: 0.5,
        maxTokens: 1600,
      },
    ]);

    const parsed = JSON.parse(serialized) as Array<{ id: string }>;
    expect(parsed.find((entry) => entry.id === "ceo")).toBeDefined();
    expect(parsed.length).toBeGreaterThanOrEqual(4);

    expect(resolveAgentChessPiece("ceo", "")).toBe("king");
    expect(resolveAgentChessPiece("custom-qa", "")).toBe("pawn");
    expect(resolveAgentChessPiece("", "Chief Technology Officer")).toBe("knight");
    expect(agentModelMeta("OpenAI", "gpt-4o-mini")).toBe("OPENAI • GPT-4O-MINI");

    vi.useFakeTimers();
    const pending = sleep(20);
    await vi.advanceTimersByTimeAsync(20);
    await expect(pending).resolves.toBeUndefined();
  });

  it("formats display strings for currency, timestamps, and first lines", () => {
    expect(firstLine("\n\n  hello world\nsecond")).toBe("hello world");
    expect(formatCurrency(1200)).toContain("$");
    expect(formatCurrency(null)).toBe("N/A");
    expect(formatDqs(7.126)).toBe("7.13");
    expect(formatDqs(Number.NaN)).toBe("0.00");
    expect(formatRunTimestamp("2026-02-21T15:30:00.000Z")).toContain("2026");
    expect(formatRunTimestamp("invalid")).toBe("");
  });

  it("builds graph tasks, nodes, and edge path data", () => {
    expect(buildReviewTasks(["CEO", "CEO", " "])).toEqual([
      { id: "ceo", title: "CEO", status: "IDLE" },
      { id: "ceo-2", title: "CEO", status: "IDLE" },
      { id: "agent-3", title: "Agent 3", status: "IDLE" },
    ]);

    expect(buildInteractionTasks(2.4)).toEqual([
      { id: "interaction-round-1", title: "Round 1", status: "IDLE" },
      { id: "interaction-round-2", title: "Round 2", status: "IDLE" },
    ]);
    expect(buildInteractionTasks(99)).toHaveLength(5);

    const nodes = buildInitialNodes(null, ["CEO"], 0);
    expect(nodes[0]?.subtitle).toBe("No Strategy Selected");
    expect(nodes[3]?.subtitle).toBe("Rebuttal disabled");
    expect(nodes[3]?.tasks).toEqual([]);

    expect(strategyStatusTone("Approved")).toBe("approved");
    expect(strategyStatusTone("Blocked")).toBe("blocked");
    expect(strategyStatusTone("In Review")).toBe("review");
    expect(strategyStatusTone("Proposed")).toBe("proposed");
    expect(edgePathData({ x: 40, y: 20 }, { x: 300, y: 20 })).toBe("M 260 60 L 300 60");
  });

  it("parses unknown values into normalized primitives", () => {
    expect(asRecord({ a: 1 })).toEqual({ a: 1 });
    expect(asRecord([])).toBeNull();
    expect(asString("hello", "x")).toBe("hello");
    expect(asString(1, "x")).toBe("x");
    expect(asNumber(1.5, 0)).toBe(1.5);
    expect(asNumber("1.5", 0)).toBe(0);
    expect(asBoolean(true, false)).toBe(true);
    expect(asBoolean("true", false)).toBe(false);
    expect(asStringArray(["a", 1, "b"])).toEqual(["a", "b"]);
    expect(asBooleanMap({ a: true, b: "x" })).toEqual({ a: true, b: false });
    expect(asStringArrayMap({ a: ["x", 1], b: "nope" })).toEqual({ a: ["x"], b: [] });
    expect(firstPresentValue([null, " ", " value "], "fallback")).toBe("value");
    expect(parseCurrencyAmount("$12,500")).toBe(12500);
    expect(parseSerializedValue('{"ok":true}')).toEqual({ ok: true });
    expect(parseSerializedValue("not-json")).toBeNull();
  });

  it("derives workflow report recommendations, metrics, governance rows, and review sort order", () => {
    const state = {
      status: "PERSISTED",
      synthesis: null,
      reviews: {
        cfo: { agent: "CFO", blocked: false, governance_checks_met: { "Problem Quantified": true } },
        ceo: { agent: "CEO", blocked: false, governance_checks_met: { "Strategic Alignment Brief": true } },
      },
      decision_snapshot: {
        properties: {
          "Primary KPI": { rich_text: [{ plain_text: "ARR" }] },
          "Investment Required": { number: 1000 },
          "12-Month Gross Benefit": "4000",
          "Risk-Adjusted ROI": 1.4,
          "Probability of Success": { select: { name: "72%" } },
          "Time Horizon": { status: { name: "Q3" } },
          "Strategic Objective": "Expand in LATAM",
          "Strategic Leverage Score": "4",
        },
        governance_checks: { "Strategic Alignment Brief": true },
      },
    } as any;

    expect(recommendationForState({ ...state, synthesis: { final_recommendation: "Blocked" } })).toBe("Blocked");
    expect(recommendationForState({ ...state, synthesis: null })).toBe("Approved");
    expect(recommendationForState({ ...state, status: "REVIEWING", reviews: { ceo: { blocked: true } } })).toBe("Blocked");
    expect(recommendationForState({ ...state, status: "REVIEWING", reviews: {} })).toBe("Challenged");

    expect(recommendationTone("Approved")).toBe("approved");
    expect(recommendationTone("Blocked")).toBe("blocked");
    expect(recommendationTone("Challenged")).toBe("challenged");

    const metrics = extractSnapshotMetrics(state);
    expect(metrics).toMatchObject({
      primaryKpi: "ARR",
      investment: 1000,
      benefit12m: 4000,
      roi: 1.4,
      probability: "72%",
      timeHorizon: "Q3",
      strategicObjective: "Expand in LATAM",
      leverageScore: "4",
    });

    expect(extractGovernanceRows(state)).toEqual([{ label: "Strategic Alignment Brief", met: true }]);
    expect(
      extractGovernanceRows({
        ...state,
        decision_snapshot: { governance_checks: {} },
        reviews: { ceo: { governance_checks_met: { "Fallback Check": false } } },
      } as any),
    ).toEqual([{ label: "Fallback Check", met: false }]);

    const sorted = sortReviews({
      ...state,
      reviews: {
        unknown: { agent: "Data" },
        cto: { agent: "CTO" },
        ceo: { agent: "CEO" },
      },
    } as any);
    expect(sorted.map((entry) => entry.agent)).toEqual(["CEO", "CTO", "Data"]);
  });
});
