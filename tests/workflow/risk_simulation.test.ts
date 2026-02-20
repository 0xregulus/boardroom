import { describe, expect, it } from "vitest";

import { runRiskSimulation } from "../../src/workflow/risk_simulation";

describe("runRiskSimulation", () => {
  it("returns deterministic estimated outcomes when baseline financial inputs exist", () => {
    const snapshot = {
      page_id: "d1",
      captured_at: "2026-02-20T00:00:00.000Z",
      properties: {
        "Investment Required": 250000,
        "12-Month Gross Benefit": 900000,
        "Probability of Success": "68%",
      },
      section_excerpt: [
        {
          type: "text",
          text: {
            content: "Market size is $5,000,000 with projected revenue of $900,000.",
          },
        },
      ],
      computed: {
        inferred_governance_checks: {},
        autochecked_governance_fields: [],
      },
    };

    const first = runRiskSimulation(snapshot, "d1", 900);
    const second = runRiskSimulation(snapshot, "d1", 900);

    expect(first).not.toBeNull();
    expect(first?.mode).toBe("estimated");
    expect(first?.sample_size).toBe(900);
    expect(first?.outcomes).not.toBeNull();
    expect(first?.outcomes?.best_case.net_value ?? 0).toBeGreaterThan(first?.outcomes?.worst_case.net_value ?? 0);
    expect(first?.outcomes?.probability_of_loss ?? 0).toBeGreaterThanOrEqual(0);
    expect(first?.outcomes?.probability_of_loss ?? 1).toBeLessThanOrEqual(1);
    expect(second?.inputs).toEqual(first?.inputs);
    expect(second?.assumptions).toEqual(first?.assumptions);
    expect(second?.outcomes).toEqual(first?.outcomes);
  });

  it("returns insufficient mode when key inputs are missing", () => {
    const snapshot = {
      page_id: "d2",
      captured_at: "2026-02-20T00:00:00.000Z",
      properties: {
        "12-Month Gross Benefit": 100000,
      },
      section_excerpt: [],
      computed: {
        inferred_governance_checks: {},
        autochecked_governance_fields: [],
      },
    };

    const result = runRiskSimulation(snapshot, "d2", 500);

    expect(result?.mode).toBe("insufficient");
    expect(result?.outcomes).toBeNull();
  });
});
