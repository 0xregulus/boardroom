import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("../../src/store/postgres/client", () => ({
  query: mocks.query,
}));

import { getPersistedAgentConfigs, upsertAgentConfigs } from "../../src/store/postgres/agent_configs";

describe("store/postgres/agent_configs", () => {
  beforeEach(() => {
    mocks.query.mockReset();
  });

  it("returns null when no rows are persisted", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(getPersistedAgentConfigs()).resolves.toBeNull();
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it("maps persisted rows and normalizes into full config set", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [
        {
          agent_id: "ceo",
          role: "CEO",
          name: "Chief Executive Officer Agent",
          system_message: "sys",
          user_message: "usr",
          provider: "OpenAI",
          model: "gpt-4o",
          temperature: "0.42",
          max_tokens: "1500",
        },
        {
          agent_id: "growth reviewer",
          role: "Reviewer",
          name: "Growth Reviewer",
          system_message: "growth sys",
          user_message: "growth usr",
          provider: "Anthropic",
          model: "claude-3-5-sonnet-latest",
          temperature: "bad-number",
          max_tokens: "",
        },
      ],
      rowCount: 2,
    });

    const result = await getPersistedAgentConfigs();

    expect(result).not.toBeNull();
    expect(result?.map((entry) => entry.id)).toEqual(["ceo", "cfo", "cto", "compliance", "growth-reviewer"]);
    expect(result?.find((entry) => entry.id === "ceo")).toMatchObject({
      temperature: 0.42,
      maxTokens: 1500,
    });
    expect(result?.find((entry) => entry.id === "growth-reviewer")).toMatchObject({
      role: "Reviewer",
      provider: "Anthropic",
      model: "claude-3-5-sonnet-latest",
      temperature: 0.35,
      maxTokens: 1700,
    });
  });

  it("upserts normalized configs after deleting removed agent ids", async () => {
    mocks.query.mockResolvedValue({ rows: [], rowCount: 1 });

    const result = await upsertAgentConfigs([
      {
        id: "ceo",
        role: "CEO",
        name: "Chief Executive Officer Agent",
        systemMessage: "custom ceo sys",
        userMessage: "custom ceo usr",
        provider: "OpenAI",
        model: "gpt-4o",
        temperature: 0.22,
        maxTokens: 1800,
      },
      {
        id: "ops reviewer",
        role: "Reviewer",
        name: "Ops Reviewer",
        systemMessage: "ops sys",
        userMessage: "ops usr",
        provider: "OpenAI",
        model: "gpt-4o-mini",
        temperature: 0.5,
        maxTokens: 1200,
      },
    ]);

    expect(result.map((entry) => entry.id)).toEqual(["ceo", "cfo", "cto", "compliance", "ops-reviewer"]);
    expect(mocks.query).toHaveBeenCalledTimes(1 + result.length);

    const deleteArgs = mocks.query.mock.calls[0]?.[1] as unknown[];
    expect(Array.isArray(deleteArgs)).toBe(true);
    expect((deleteArgs[0] as string[]).sort()).toEqual(["ceo", "cfo", "compliance", "cto", "ops-reviewer"]);

    const firstInsert = mocks.query.mock.calls[1]?.[1] as unknown[];
    expect(firstInsert).toEqual([
      "ceo",
      "CEO",
      "Chief Executive Officer Agent",
      "custom ceo sys",
      "custom ceo usr",
      "OpenAI",
      "gpt-4o",
      0.22,
      1800,
    ]);

    const lastInsert = mocks.query.mock.calls[mocks.query.mock.calls.length - 1]?.[1] as unknown[];
    expect(lastInsert?.[0]).toBe("ops-reviewer");
  });
});
