import { beforeEach, describe, expect, it, vi } from "vitest";

const researchMocks = vi.hoisted(() => ({
  fetchResearch: vi.fn(),
  formatResearch: vi.fn(),
}));

vi.mock("../../src/research", () => ({
  fetchResearch: researchMocks.fetchResearch,
  formatResearch: researchMocks.formatResearch,
}));

import { ConfiguredComplianceAgent, ConfiguredReviewAgent } from "../../src/agents/base";
import { LLMClient } from "../../src/llm/client";

function llmClientWith(content: string): LLMClient {
  return {
    provider: "OpenAI",
    complete: vi.fn().mockResolvedValue(content),
  };
}

const promptOverride = {
  systemMessage: "System",
  userTemplate: "snapshot={snapshot_json}\nmissing={missing_sections_str}\n",
};

const validReviewJson = JSON.stringify({
  thesis: "Valid review",
  score: 8,
  confidence: 0.8,
  blocked: false,
  blockers: [],
  risks: [],
  citations: [],
  required_changes: [],
  approval_conditions: [],
  apga_impact_view: "Positive",
  governance_checks_met: {},
});

describe("Agent external research wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("injects formatted research context for review agents when enabled", async () => {
    researchMocks.fetchResearch.mockResolvedValueOnce({ items: [] });
    researchMocks.formatResearch.mockReturnValueOnce("## External Research (Tavily)\nURL: https://example.com");

    const client = llmClientWith(validReviewJson);

    const agent = new ConfiguredReviewAgent("CEO", client, "gpt-4o-mini", 0.2, 1200, {
      promptOverride,
      includeExternalResearch: true,
      provider: "OpenAI",
    });

    await agent.evaluate({
      snapshot: { id: "d-1" },
      memory_context: { missing_sections: [] },
    });

    expect(researchMocks.fetchResearch).toHaveBeenCalledWith(
      expect.objectContaining({
        agentName: "CEO",
        snapshot: { id: "d-1" },
      }),
      "Tavily",
    );

    const completeMock = client.complete as unknown as ReturnType<typeof vi.fn>;
    expect(completeMock).toHaveBeenCalledTimes(1);
    expect(completeMock.mock.calls[0]?.[0]?.userMessage).toContain("External Research (Tavily)");
  });

  it("skips research lookup for review agents when disabled", async () => {
    researchMocks.formatResearch.mockReturnValueOnce("");

    const client = llmClientWith(validReviewJson);

    const agent = new ConfiguredReviewAgent("CEO", client, "gpt-4o-mini", 0.2, 1200, {
      promptOverride,
      includeExternalResearch: false,
      provider: "OpenAI",
    });

    await agent.evaluate({ snapshot: { id: "d-1" }, memory_context: {} });

    expect(researchMocks.fetchResearch).not.toHaveBeenCalled();
    const completeMock = client.complete as unknown as ReturnType<typeof vi.fn>;
    expect(completeMock.mock.calls[0]?.[0]?.userMessage).not.toContain("External Research (Tavily)");
  });

  it("injects research context for compliance agent when enabled", async () => {
    researchMocks.fetchResearch.mockResolvedValueOnce({ items: [] });
    researchMocks.formatResearch.mockReturnValueOnce("## External Research (Tavily)\nSnippet: signal");

    const client = llmClientWith(validReviewJson);
    const agent = new ConfiguredComplianceAgent(client, "gpt-4o-mini", 0.2, 500, {
      promptOverride,
      includeExternalResearch: true,
      provider: "OpenAI",
    });

    await agent.evaluate({ snapshot: { id: "d-2" }, memory_context: {} });

    expect(researchMocks.fetchResearch).toHaveBeenCalledWith(
      expect.objectContaining({
        agentName: "Compliance",
        snapshot: { id: "d-2" },
      }),
      "Tavily",
    );

    const completeMock = client.complete as unknown as ReturnType<typeof vi.fn>;
    expect(completeMock.mock.calls[0]?.[0]?.userMessage).toContain("External Research (Tavily)");
  });
});
