import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("../../src/store/postgres/client", () => ({
  query: mocks.query,
}));

import {
  setDecisionGovernanceChecks,
  upsertDecisionDocument,
  upsertDecisionRecord,
  upsertGovernanceChecks,
} from "../../src/store/postgres/decisions";

describe("store/postgres/decisions write paths", () => {
  beforeEach(() => {
    mocks.query.mockReset();
  });

  it("upserts decision records with defaults and serialized mitigations", async () => {
    mocks.query.mockResolvedValue({ rows: [], rowCount: 1 });

    await upsertDecisionRecord({
      id: "d-1",
      name: "Decision One",
      owner: "Alex",
      reviewDate: "2026-02-16T00:00:00.000Z",
      summary: "Summary",
      primaryKpi: "Conversion",
      investmentRequired: 100000,
      strategicObjective: "Growth",
      confidence: "High",
      baseline: 10,
      target: 20,
      timeHorizon: "Q3",
      probabilityOfSuccess: "72%",
      leverageScore: "4",
      riskAdjustedRoi: 1.8,
      benefit12mGross: 220000,
      decisionType: "Reversible",
      mitigations: ["Pilot", "Feature flag"],
      detailsUrl: "https://example.com/decision",
      createdAt: "2026-02-15T00:00:00.000Z",
    });

    const args = mocks.query.mock.calls[0]?.[1] as unknown[];
    expect(args[0]).toBe("d-1");
    expect(args[1]).toBe("Decision One");
    expect(args[2]).toBe("Proposed");
    expect(args[18]).toBe(JSON.stringify(["Pilot", "Feature flag"]));
    expect(args[20]).toBe("2026-02-15T00:00:00.000Z");
  });

  it("upserts decision records with explicit status and null mitigations", async () => {
    mocks.query.mockResolvedValue({ rows: [], rowCount: 1 });

    await upsertDecisionRecord({
      id: "d-2",
      name: "Decision Two",
      status: "Approved",
    });

    const args = mocks.query.mock.calls[0]?.[1] as unknown[];
    expect(args[2]).toBe("Approved");
    expect(args[18]).toBeNull();
  });

  it("upserts decision documents by id", async () => {
    mocks.query.mockResolvedValue({ rows: [], rowCount: 1 });

    await upsertDecisionDocument("d-1", "## Decision body");

    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.query.mock.calls[0]?.[1]).toEqual(["d-1", "## Decision body"]);
  });

  it("deletes governance checks and exits early when no checks are provided", async () => {
    mocks.query.mockResolvedValue({ rows: [], rowCount: 0 });

    await setDecisionGovernanceChecks("d-1", {});

    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.query.mock.calls[0]?.[1]).toEqual(["d-1"]);
  });

  it("sets governance checks via unnest arrays when checks are provided", async () => {
    mocks.query.mockResolvedValue({ rows: [], rowCount: 2 });

    await setDecisionGovernanceChecks("d-1", {
      "Gate A": true,
      "Gate B": false,
    });

    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(mocks.query.mock.calls[1]?.[1]).toEqual(["d-1", ["Gate A", "Gate B"], [true, false]]);
  });

  it("dedupes and trims governance gates for upsert", async () => {
    mocks.query.mockResolvedValue({ rows: [], rowCount: 1 });

    await upsertGovernanceChecks("d-1", [" Gate A ", "Gate A", "", "Gate B"]);
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.query.mock.calls[0]?.[1]).toEqual(["d-1", ["Gate A", "Gate B"]]);

    mocks.query.mockReset();
    await upsertGovernanceChecks("d-1", [" ", ""]);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
