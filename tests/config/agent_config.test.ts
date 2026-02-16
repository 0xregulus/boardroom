import { describe, expect, it } from "vitest";

import {
  CORE_AGENT_ORDER,
  buildCustomAgentConfig,
  buildDefaultAgentConfigs,
  getDefaultAgentConfig,
  isAgentId,
  isCoreAgentId,
  normalizeAgentConfigs,
  type AgentConfig,
} from "../../src/config/agent_config";

describe("agent_config", () => {
  it("builds default configs in core order", () => {
    const defaults = buildDefaultAgentConfigs();
    expect(defaults.map((entry) => entry.id)).toEqual([...CORE_AGENT_ORDER]);
    expect(defaults).toHaveLength(4);
  });

  it("includes runtime placeholders in default prompt templates", () => {
    const defaults = buildDefaultAgentConfigs();

    defaults.forEach((config) => {
      expect(config.userMessage).toContain("{snapshot_json}");
      expect(config.userMessage).toContain("{missing_sections_str}");
      expect(config.userMessage).toContain("{governance_checkbox_fields_str}");
    });
  });

  it("upgrades legacy core user prompts to templated defaults", () => {
    const legacyCeoPrompt =
      "Review the strategic decision brief. Return a JSON assessment with thesis, score, blockers, risks, required_changes, approval_conditions, and governance_checks_met. Prioritize strategic clarity, decision quality, and organizational alignment.";

    const normalized = normalizeAgentConfigs([
      {
        id: "ceo",
        userMessage: legacyCeoPrompt,
      },
    ] as unknown as AgentConfig[]);

    const ceo = normalized.find((config) => config.id === "ceo");
    expect(ceo?.userMessage).toContain("{snapshot_json}");
    expect(ceo?.userMessage).not.toBe(legacyCeoPrompt);
  });

  it("returns default config by core id", () => {
    const cto = getDefaultAgentConfig("cto");
    expect(cto.id).toBe("cto");
    expect(cto.name).toContain("Technology");
  });

  it("validates core and generic agent ids", () => {
    expect(isCoreAgentId("ceo")).toBe(true);
    expect(isCoreAgentId("reviewer-1")).toBe(false);

    expect(isAgentId("reviewer-1")).toBe(true);
    expect(isAgentId("reviewer 1")).toBe(true);
    expect(isAgentId("***")).toBe(false);
  });

  it("creates a non-conflicting custom reviewer id", () => {
    const config = buildCustomAgentConfig([
      { ...getDefaultAgentConfig("ceo") },
      {
        ...getDefaultAgentConfig("cfo"),
      },
      {
        ...getDefaultAgentConfig("cto"),
      },
      {
        ...getDefaultAgentConfig("compliance"),
      },
      {
        id: "reviewer-1",
        role: "Reviewer 1",
        name: "Custom Review Agent 1",
        systemMessage: "x",
        userMessage: "y",
        provider: "OpenAI",
        model: "gpt-4o-mini",
        temperature: 0.3,
        maxTokens: 1000,
      },
    ]);

    expect(config.id).toBe("reviewer-2");
    expect(config.name).toBe("Custom Review Agent 2");
  });

  it("normalizes custom entries, clamps values, and preserves core defaults", () => {
    const normalized = normalizeAgentConfigs([
      {
        id: " CTO ",
        role: "",
        name: "",
        systemMessage: "",
        userMessage: "",
        provider: "meta",
        model: "invalid",
        temperature: 9,
        maxTokens: 1,
      },
      {
        id: "Reviewer ALPHA",
        role: "  Staff Reviewer  ",
        name: "  Alpha  ",
        systemMessage: "S",
        userMessage: "U",
        provider: "Mistral",
        model: "mistral-small-latest",
        temperature: -5,
        maxTokens: 99999,
      },
      {
        id: "***",
      },
    ] as unknown as AgentConfig[]);

    expect(normalized.map((entry) => entry.id)).toEqual(["ceo", "cfo", "cto", "compliance", "reviewer-alpha"]);

    const cto = normalized.find((entry) => entry.id === "cto");
    expect(cto?.provider).toBe("Meta");
    expect(cto?.model).toBe("llama-3.1-70b-instruct");
    expect(cto?.temperature).toBe(1);
    expect(cto?.maxTokens).toBe(256);

    const custom = normalized.find((entry) => entry.id === "reviewer-alpha");
    expect(custom?.role).toBe("Staff Reviewer");
    expect(custom?.name).toBe("Alpha");
    expect(custom?.temperature).toBe(0);
    expect(custom?.maxTokens).toBe(8000);
  });

  it("falls back to defaults when input is not an array", () => {
    const normalized = normalizeAgentConfigs(null);
    expect(normalized.map((entry) => entry.id)).toEqual(["ceo", "cfo", "cto", "compliance"]);
  });
});
