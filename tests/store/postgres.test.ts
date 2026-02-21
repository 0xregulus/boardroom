import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  poolCtor: vi.fn(),
}));

vi.mock("pg", () => ({
  Pool: class Pool {
    constructor(config: unknown) {
      mocks.poolCtor(config);
    }

    query(text: string, values: unknown[] = []) {
      return mocks.query(text, values);
    }
  },
}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  mocks.query.mockReset();
  mocks.poolCtor.mockReset();
  process.env = {
    ...ORIGINAL_ENV,
    POSTGRES_URL: "postgres://test:test@localhost:5432/test",
  };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function withSchemaBootstrap(handler: (sql: string, values: unknown[]) => unknown | Promise<unknown>) {
  mocks.query.mockImplementation(async (text: string, values: unknown[] = []) => {
    const sql = String(text);

    if (sql.includes("CREATE TABLE IF NOT EXISTS decisions")) {
      return { rows: [], rowCount: 0 };
    }

    if (sql.includes("SELECT COUNT(*)::text AS total FROM agent_configs")) {
      return { rows: [{ total: "1" }], rowCount: 1 };
    }

    const result = await handler(sql, values);
    if (result === undefined) {
      throw new Error(`Unhandled SQL in test: ${sql}`);
    }

    return result;
  });
}

describe("store/postgres", () => {
  it("returns null when no persisted agent configs exist", async () => {
    withSchemaBootstrap((sql) => {
      if (sql.includes("FROM agent_configs")) {
        return { rows: [], rowCount: 0 };
      }
      return undefined;
    });

    const mod = await import("../../src/store/postgres");
    await expect(mod.getPersistedAgentConfigs()).resolves.toBeNull();
  });

  it("normalizes persisted agent configs", async () => {
    withSchemaBootstrap((sql) => {
      if (sql.includes("FROM agent_configs")) {
        return {
          rows: [
            {
              agent_id: "ceo",
              role: "CEO",
              name: "Chief Executive Officer Agent",
              system_message: "system",
              user_message: "user",
              provider: "OpenAI",
              model: "gpt-4o",
              temperature: "0.5",
              max_tokens: "1500",
            },
          ],
          rowCount: 1,
        };
      }
      return undefined;
    });

    const mod = await import("../../src/store/postgres");
    const output = await mod.getPersistedAgentConfigs();

    expect(output).not.toBeNull();
    expect(output?.[0]?.id).toBe("ceo");
    expect(output?.map((entry) => entry.id)).toContain("compliance");
  });

  it("lists strategic decision log entries with normalized fields", async () => {
    withSchemaBootstrap((sql) => {
      if (sql.includes("FROM decisions")) {
        return {
          rows: [
            {
              id: "d1",
              name: "",
              status: "challenged",
              owner: null,
              review_date: null,
              summary: null,
              primary_kpi: null,
              investment_required: "120000",
              strategic_objective: null,
              confidence: null,
              details_url: null,
              created_at: "2026-02-16T00:00:00.000Z",
            },
          ],
          rowCount: 1,
        };
      }
      return undefined;
    });

    const mod = await import("../../src/store/postgres");
    const entries = await mod.listStrategicDecisionLogEntries();

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: "d1",
      status: "In Review",
      owner: "Unassigned",
      investment: "$120,000",
    });
    expect(entries[0]?.name).toContain("Decision");
  });

  it("lists proposed decision ids", async () => {
    withSchemaBootstrap((sql) => {
      if (sql.includes("WHERE LOWER(status) = LOWER($1)")) {
        return {
          rows: [{ id: "d1" }, { id: "d2" }],
          rowCount: 2,
        };
      }
      return undefined;
    });

    const mod = await import("../../src/store/postgres");
    await expect(mod.listProposedDecisionIds()).resolves.toEqual(["d1", "d2"]);
  });

  it("returns null when decision is not found for workflow", async () => {
    withSchemaBootstrap((sql) => {
      if (sql.includes("FROM decisions d")) {
        return { rows: [], rowCount: 0 };
      }
      return undefined;
    });

    const mod = await import("../../src/store/postgres");
    await expect(mod.getDecisionForWorkflow("missing")).resolves.toBeNull();
  });

  it("maps workflow decision and governance checks", async () => {
    withSchemaBootstrap((sql) => {
      if (sql.includes("FROM decisions d")) {
        return {
          rows: [
            {
              id: "d1",
              name: "Decision One",
              status: "Proposed",
              owner: "Alice",
              review_date: "2026-02-16",
              summary: "Summary",
              primary_kpi: "KPI",
              investment_required: "1000",
              strategic_objective: "Grow",
              confidence: "High",
              baseline: "1",
              target: "2",
              time_horizon: "Q2",
              probability_of_success: "70%",
              leverage_score: "3",
              risk_adjusted_roi: "1.2",
              benefit_12m_gross: "5000",
              decision_type: "Reversible",
              created_at: "2026-02-16T00:00:00.000Z",
              body_text: "Body",
            },
          ],
          rowCount: 1,
        };
      }

      if (sql.includes("FROM decision_governance_checks")) {
        return {
          rows: [
            { gate_name: "Strategic Alignment Brief", is_checked: true },
            { gate_name: "Problem Quantified", is_checked: false },
          ],
          rowCount: 2,
        };
      }

      return undefined;
    });

    const mod = await import("../../src/store/postgres");
    const decision = await mod.getDecisionForWorkflow("d1");

    expect(decision).toMatchObject({
      id: "d1",
      name: "Decision One",
      bodyText: "Body",
      governanceChecks: {
        "Strategic Alignment Brief": true,
        "Problem Quantified": false,
      },
    });
    expect(decision?.properties.Baseline).toBe(1);
  });

  it("updates decision status and throws if row is missing", async () => {
    const calls: string[] = [];

    withSchemaBootstrap((sql) => {
      if (sql.includes("UPDATE decisions")) {
        calls.push(sql);
        return { rows: [{ id: "d1" }], rowCount: 1 };
      }
      return undefined;
    });

    const mod = await import("../../src/store/postgres");
    await expect(mod.updateDecisionStatus("d1", "Approved")).resolves.toBeUndefined();
    expect(calls).toHaveLength(1);

    withSchemaBootstrap((sql) => {
      if (sql.includes("UPDATE decisions")) {
        return { rows: [], rowCount: 0 };
      }
      return undefined;
    });

    await expect(mod.updateDecisionStatus("missing", "Approved")).rejects.toThrow("missing");
  });

  it("upserts governance checks after trimming and deduping", async () => {
    withSchemaBootstrap((sql, values) => {
      if (sql.includes("INSERT INTO decision_governance_checks")) {
        expect(values[0]).toBe("d1");
        expect(values[1]).toEqual(["Gate A", "Gate B"]);
        return { rows: [], rowCount: 2 };
      }
      return undefined;
    });

    const mod = await import("../../src/store/postgres");
    await mod.upsertGovernanceChecks("d1", [" Gate A ", "Gate A", "", "Gate B"]);
  });

  it("loads persisted workflow outputs", async () => {
    withSchemaBootstrap((sql) => {
      if (sql.includes("FROM decision_reviews")) {
        return {
          rows: [
            {
              agent_name: "ceo",
              agent_role: "CEO",
              thesis: "Thesis",
              score: "8",
              confidence: "0.75",
              blocked: false,
              blockers: '["b1"]',
              risks: [{ type: "risk", severity: 5, evidence: "e1" }],
              required_changes: '["c1"]',
              approval_conditions: '["a1"]',
              apga_impact_view: "Positive",
              governance_checks_met: '{"Gate": true}',
            },
          ],
          rowCount: 1,
        };
      }

      if (sql.includes("FROM decision_synthesis")) {
        return {
          rows: [
            {
              executive_summary: "Summary",
              final_recommendation: "Approved",
              conflicts: '["x"]',
              blockers: '["y"]',
              required_revisions: '["z"]',
            },
          ],
          rowCount: 1,
        };
      }

      if (sql.includes("FROM decision_prds")) {
        return {
          rows: [
            {
              title: "PRD",
              scope: '["s1"]',
              milestones: '["m1"]',
              telemetry: '["t1"]',
              risks: '["r1"]',
              sections: { Goals: ["g1"] },
            },
          ],
          rowCount: 1,
        };
      }

      return undefined;
    });

    const mod = await import("../../src/store/postgres");
    const output = await mod.loadPersistedDecisionOutputs("d1");

    expect(output.reviews.ceo).toMatchObject({
      agent: "CEO",
      score: 8,
      blockers: ["b1"],
      governance_checks_met: { Gate: true },
    });
    expect(output.synthesis?.final_recommendation).toBe("Approved");
    expect(output.prd?.title).toBe("PRD");
  });

  it("lists workflow runs with normalized values and bounded limit", async () => {
    withSchemaBootstrap((sql, values) => {
      if (sql.includes("FROM workflow_runs")) {
        expect(values).toEqual(["d-1", 100]);
        return {
          rows: [
            {
              id: "0",
              decision_id: "d-1",
              dqs: "8.7",
              gate_decision: "approved",
              workflow_status: "PERSISTED",
              decision_name: "Decision One",
              state_status: "DECIDED",
              summary_line: "Decision One summary",
              missing_sections: ["Baseline"],
              created_at: "2026-02-16T01:02:03.000Z",
            },
          ],
          rowCount: 1,
        };
      }
      return undefined;
    });

    const mod = await import("../../src/store/postgres");
    const runs = await mod.listWorkflowRuns("  d-1  ", 999);

    expect(runs).toEqual([
      {
        id: 1,
        decisionId: "d-1",
        dqs: 8.7,
        gateDecision: "approved",
        workflowStatus: "PERSISTED",
        decisionName: "Decision One",
        stateStatus: "DECIDED",
        summaryLine: "Decision One summary",
        missingSections: ["Baseline"],
        reviewStances: [],
        riskFindingsCount: 0,
        mitigationCount: 0,
        pendingMitigationsCount: 0,
        frictionScore: 0,
        createdAt: "2026-02-16T01:02:03.000Z",
      },
    ]);
  });

  it("rejects empty decision id when listing workflow runs", async () => {
    const mod = await import("../../src/store/postgres");
    await expect(mod.listWorkflowRuns("   ")).rejects.toThrow("decisionId is required");
  });

  it("checks database health with SELECT 1", async () => {
    withSchemaBootstrap((sql) => {
      if (sql.includes("SELECT 1")) {
        return { rows: [{ "?column?": 1 }], rowCount: 1 };
      }
      return undefined;
    });

    const mod = await import("../../src/store/postgres");
    await expect(mod.checkDatabaseHealth()).resolves.toBeUndefined();
  });
});
