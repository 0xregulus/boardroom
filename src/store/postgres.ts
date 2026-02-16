import { Pool, QueryResult, QueryResultRow } from "pg";

import { AgentConfig, buildDefaultAgentConfigs, normalizeAgentConfigs } from "../config/agent_config";
import { PRDOutput } from "../schemas/prd_output";
import { ReviewOutput } from "../schemas/review_output";
import type { ChairpersonSynthesis } from "../workflow/states";

export type StrategicDecisionLogStatus = "Proposed" | "In Review" | "Approved" | "Blocked";

export interface StrategicDecisionLogEntry {
  id: string;
  name: string;
  status: StrategicDecisionLogStatus;
  owner: string;
  reviewDate: string;
  summary: string;
  primaryKpi: string;
  investment: string;
  strategicObjective: string;
  confidence: string;
  detailsUrl?: string;
}

export interface DecisionForWorkflow {
  id: string;
  name: string;
  createdAt: string;
  bodyText: string;
  properties: Record<string, unknown>;
  governanceChecks: Record<string, boolean>;
}

export interface DecisionUpsertInput {
  id: string;
  name: string;
  status?: string | null;
  owner?: string | null;
  reviewDate?: string | null;
  summary?: string | null;
  primaryKpi?: string | null;
  investmentRequired?: number | null;
  strategicObjective?: string | null;
  confidence?: string | null;
  baseline?: number | null;
  target?: number | null;
  timeHorizon?: string | null;
  probabilityOfSuccess?: string | null;
  leverageScore?: string | null;
  riskAdjustedRoi?: number | null;
  benefit12mGross?: number | null;
  decisionType?: string | null;
  detailsUrl?: string | null;
  createdAt?: string | null;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Proposed',
  owner TEXT,
  review_date TIMESTAMPTZ,
  summary TEXT,
  primary_kpi TEXT,
  investment_required NUMERIC,
  strategic_objective TEXT,
  confidence TEXT,
  baseline NUMERIC,
  target NUMERIC,
  time_horizon TEXT,
  probability_of_success TEXT,
  leverage_score TEXT,
  risk_adjusted_roi NUMERIC,
  benefit_12m_gross NUMERIC,
  decision_type TEXT,
  details_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS decision_documents (
  decision_id TEXT PRIMARY KEY REFERENCES decisions(id) ON DELETE CASCADE,
  body_text TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS decision_governance_checks (
  decision_id TEXT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  gate_name TEXT NOT NULL,
  is_checked BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (decision_id, gate_name)
);

CREATE TABLE IF NOT EXISTS decision_reviews (
  decision_id TEXT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  thesis TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 1 AND score <= 10),
  confidence NUMERIC NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  blocked BOOLEAN NOT NULL DEFAULT FALSE,
  blockers JSONB NOT NULL DEFAULT '[]'::jsonb,
  risks JSONB NOT NULL DEFAULT '[]'::jsonb,
  required_changes JSONB NOT NULL DEFAULT '[]'::jsonb,
  approval_conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  apga_impact_view TEXT NOT NULL DEFAULT '',
  governance_checks_met JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (decision_id, agent_name)
);

CREATE TABLE IF NOT EXISTS decision_synthesis (
  decision_id TEXT PRIMARY KEY REFERENCES decisions(id) ON DELETE CASCADE,
  executive_summary TEXT NOT NULL,
  final_recommendation TEXT NOT NULL,
  conflicts JSONB NOT NULL DEFAULT '[]'::jsonb,
  blockers JSONB NOT NULL DEFAULT '[]'::jsonb,
  required_revisions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS decision_prds (
  decision_id TEXT PRIMARY KEY REFERENCES decisions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Draft',
  scope JSONB NOT NULL DEFAULT '[]'::jsonb,
  milestones JSONB NOT NULL DEFAULT '[]'::jsonb,
  telemetry JSONB NOT NULL DEFAULT '[]'::jsonb,
  risks JSONB NOT NULL DEFAULT '[]'::jsonb,
  sections JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id BIGSERIAL PRIMARY KEY,
  decision_id TEXT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  dqs NUMERIC NOT NULL,
  gate_decision TEXT NOT NULL,
  workflow_status TEXT NOT NULL,
  state_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_configs (
  agent_id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  name TEXT NOT NULL,
  system_message TEXT NOT NULL,
  user_message TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  temperature NUMERIC NOT NULL,
  max_tokens INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS decisions_status_idx ON decisions(status);
CREATE INDEX IF NOT EXISTS decisions_review_date_idx ON decisions(review_date DESC);
CREATE INDEX IF NOT EXISTS decision_reviews_decision_idx ON decision_reviews(decision_id);
CREATE INDEX IF NOT EXISTS workflow_runs_decision_idx ON workflow_runs(decision_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_configs_updated_idx ON agent_configs(updated_at DESC);
`;

const USD_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

function getPool(): Pool {
  if (pool) {
    return pool;
  }

  const connectionString = process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error("POSTGRES_URL is required");
  }

  pool = new Pool({ connectionString });
  return pool;
}

async function seedDefaultAgentConfigsIfEmpty(): Promise<void> {
  const db = getPool();
  const countResult = await db.query<{ total: string }>("SELECT COUNT(*)::text AS total FROM agent_configs");
  const total = Number(countResult.rows[0]?.total ?? "0");

  if (!Number.isFinite(total) || total > 0) {
    return;
  }

  const defaults = buildDefaultAgentConfigs();
  for (const config of defaults) {
    await db.query(
      `
        INSERT INTO agent_configs (
          agent_id,
          role,
          name,
          system_message,
          user_message,
          provider,
          model,
          temperature,
          max_tokens,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          NOW(),
          NOW()
        )
        ON CONFLICT (agent_id) DO NOTHING
      `,
      [
        config.id,
        config.role,
        config.name,
        config.systemMessage,
        config.userMessage,
        config.provider,
        config.model,
        config.temperature,
        config.maxTokens,
      ],
    );
  }
}

async function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await getPool().query(SCHEMA_SQL);
      await seedDefaultAgentConfigsIfEmpty();
    })();
  }

  try {
    await schemaReady;
  } catch (error) {
    schemaReady = null;
    throw error;
  }
}

async function query<T extends QueryResultRow>(text: string, values: unknown[] = []): Promise<QueryResult<T>> {
  await ensureSchema();
  return getPool().query<T>(text, values);
}

function asString(value: unknown, fallback = ""): string {
  if (typeof value !== "string") {
    return fallback;
  }
  return value;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toIsoTimestamp(value: unknown): string {
  if (!value) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return "";
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((entry): entry is string => typeof entry === "string");
      }
    } catch {
      return [];
    }
  }

  return [];
}

function toBooleanMap(value: unknown): Record<string, boolean> {
  const parsedValue = (() => {
    if (typeof value === "string") {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        return null;
      }
    }
    return value;
  })();

  if (!parsedValue || typeof parsedValue !== "object" || Array.isArray(parsedValue)) {
    return {};
  }

  const output: Record<string, boolean> = {};
  for (const [key, entry] of Object.entries(parsedValue as Record<string, unknown>)) {
    output[key] = Boolean(entry);
  }
  return output;
}

function normalizeStatus(status: string): StrategicDecisionLogStatus {
  const lowered = status.toLowerCase().trim();
  if (lowered.includes("approved")) {
    return "Approved";
  }
  if (lowered.includes("blocked")) {
    return "Blocked";
  }
  if (
    lowered.includes("review") ||
    lowered.includes("evaluation") ||
    lowered.includes("challenged") ||
    lowered.includes("incomplete")
  ) {
    return "In Review";
  }
  return "Proposed";
}

function formatReviewDate(value: unknown): { label: string; timestamp: number } {
  const iso = toIsoTimestamp(value);
  if (!iso) {
    return { label: "No review date", timestamp: Number.NEGATIVE_INFINITY };
  }

  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return { label: "No review date", timestamp: Number.NEGATIVE_INFINITY };
  }

  return {
    label: parsed.toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    }),
    timestamp: parsed.getTime(),
  };
}

function formatInvestment(value: unknown): string {
  const numeric = toNumber(value);
  if (numeric !== null) {
    return USD_FORMATTER.format(numeric);
  }
  return "N/A";
}

interface AgentConfigRow extends QueryResultRow {
  agent_id: string;
  role: string;
  name: string;
  system_message: string;
  user_message: string;
  provider: string;
  model: string;
  temperature: string | number;
  max_tokens: string | number;
}

export async function getPersistedAgentConfigs(): Promise<AgentConfig[] | null> {
  const result = await query<AgentConfigRow>(
    `
      SELECT
        agent_id,
        role,
        name,
        system_message,
        user_message,
        provider,
        model,
        temperature,
        max_tokens
      FROM agent_configs
      ORDER BY agent_id ASC
    `,
  );

  if (result.rows.length === 0) {
    return null;
  }

  const rawConfigs = result.rows.map((row) => ({
    id: row.agent_id,
    role: row.role,
    name: row.name,
    systemMessage: row.system_message,
    userMessage: row.user_message,
    provider: row.provider,
    model: row.model,
    temperature: toNumber(row.temperature) ?? undefined,
    maxTokens: toNumber(row.max_tokens) ?? undefined,
  }));

  return normalizeAgentConfigs(rawConfigs);
}

export async function upsertAgentConfigs(agentConfigs: AgentConfig[]): Promise<AgentConfig[]> {
  const normalized = normalizeAgentConfigs(agentConfigs);
  const configuredAgentIds = normalized.map((config) => config.id);

  await query(
    `
      DELETE FROM agent_configs
      WHERE NOT (agent_id = ANY($1::text[]))
    `,
    [configuredAgentIds],
  );

  for (const config of normalized) {
    await query(
      `
        INSERT INTO agent_configs (
          agent_id,
          role,
          name,
          system_message,
          user_message,
          provider,
          model,
          temperature,
          max_tokens,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          NOW(),
          NOW()
        )
        ON CONFLICT (agent_id)
        DO UPDATE SET
          role = EXCLUDED.role,
          name = EXCLUDED.name,
          system_message = EXCLUDED.system_message,
          user_message = EXCLUDED.user_message,
          provider = EXCLUDED.provider,
          model = EXCLUDED.model,
          temperature = EXCLUDED.temperature,
          max_tokens = EXCLUDED.max_tokens,
          updated_at = NOW()
      `,
      [
        config.id,
        config.role,
        config.name,
        config.systemMessage,
        config.userMessage,
        config.provider,
        config.model,
        config.temperature,
        config.maxTokens,
      ],
    );
  }

  return normalized;
}

interface DecisionListRow extends QueryResultRow {
  id: string;
  name: string;
  status: string;
  owner: string | null;
  review_date: Date | string | null;
  summary: string | null;
  primary_kpi: string | null;
  investment_required: string | number | null;
  strategic_objective: string | null;
  confidence: string | null;
  details_url: string | null;
  created_at: Date | string;
}

export async function listStrategicDecisionLogEntries(): Promise<StrategicDecisionLogEntry[]> {
  const result = await query<DecisionListRow>(
    `
      SELECT
        id,
        name,
        status,
        owner,
        review_date,
        summary,
        primary_kpi,
        investment_required,
        strategic_objective,
        confidence,
        details_url,
        created_at
      FROM decisions
      ORDER BY COALESCE(review_date, created_at) DESC
    `,
  );

  return result.rows.map((row) => {
    const reviewDate = formatReviewDate(row.review_date ?? row.created_at);
    const name = asString(row.name, "").trim() || `Decision ${row.id.slice(0, 8)}`;
    const summary = asString(row.summary, "").trim() || `Decision brief for ${name}.`;

    return {
      id: row.id,
      name,
      status: normalizeStatus(asString(row.status, "Proposed")),
      owner: asString(row.owner, "Unassigned").trim() || "Unassigned",
      reviewDate: reviewDate.label,
      summary,
      primaryKpi: asString(row.primary_kpi, "Not specified").trim() || "Not specified",
      investment: formatInvestment(row.investment_required),
      strategicObjective: asString(row.strategic_objective, "Not specified").trim() || "Not specified",
      confidence: asString(row.confidence, "N/A").trim() || "N/A",
      detailsUrl: asString(row.details_url, "").trim() || undefined,
    } satisfies StrategicDecisionLogEntry;
  });
}

interface DecisionIdRow extends QueryResultRow {
  id: string;
}

export async function listProposedDecisionIds(): Promise<string[]> {
  const result = await query<DecisionIdRow>(
    `
      SELECT id
      FROM decisions
      WHERE LOWER(status) = LOWER($1)
      ORDER BY COALESCE(review_date, created_at) DESC
    `,
    ["Proposed"],
  );

  return result.rows.map((row) => row.id);
}

interface DecisionWorkflowRow extends QueryResultRow {
  id: string;
  name: string;
  status: string;
  owner: string | null;
  review_date: Date | string | null;
  summary: string | null;
  primary_kpi: string | null;
  investment_required: string | number | null;
  strategic_objective: string | null;
  confidence: string | null;
  baseline: string | number | null;
  target: string | number | null;
  time_horizon: string | null;
  probability_of_success: string | null;
  leverage_score: string | null;
  risk_adjusted_roi: string | number | null;
  benefit_12m_gross: string | number | null;
  decision_type: string | null;
  created_at: Date | string;
  body_text: string | null;
}

interface DecisionGovernanceRow extends QueryResultRow {
  gate_name: string;
  is_checked: boolean;
}

export async function getDecisionForWorkflow(decisionId: string): Promise<DecisionForWorkflow | null> {
  const decisionResult = await query<DecisionWorkflowRow>(
    `
      SELECT
        d.id,
        d.name,
        d.status,
        d.owner,
        d.review_date,
        d.summary,
        d.primary_kpi,
        d.investment_required,
        d.strategic_objective,
        d.confidence,
        d.baseline,
        d.target,
        d.time_horizon,
        d.probability_of_success,
        d.leverage_score,
        d.risk_adjusted_roi,
        d.benefit_12m_gross,
        d.decision_type,
        d.created_at,
        doc.body_text
      FROM decisions d
      LEFT JOIN decision_documents doc ON doc.decision_id = d.id
      WHERE d.id = $1
      LIMIT 1
    `,
    [decisionId],
  );

  const row = decisionResult.rows[0];
  if (!row) {
    return null;
  }

  const governanceResult = await query<DecisionGovernanceRow>(
    `
      SELECT gate_name, is_checked
      FROM decision_governance_checks
      WHERE decision_id = $1
    `,
    [decisionId],
  );

  const governanceChecks: Record<string, boolean> = {};
  for (const gateRow of governanceResult.rows) {
    governanceChecks[gateRow.gate_name] = Boolean(gateRow.is_checked);
  }

  const properties: Record<string, unknown> = {
    "Decision Name": row.name,
    Status: row.status,
    Owner: row.owner ?? "Unassigned",
    "Review Date": toIsoTimestamp(row.review_date),
    "Executive Summary": row.summary ?? "",
    "Primary KPI": row.primary_kpi ?? "",
    "Investment Required": toNumber(row.investment_required),
    "Strategic Objective": row.strategic_objective ?? "",
    "Confidence Level": row.confidence ?? "",
    Baseline: toNumber(row.baseline),
    Target: toNumber(row.target),
    "Time Horizon": row.time_horizon ?? "",
    "Probability of Success": row.probability_of_success ?? "",
    "Strategic Leverage Score": row.leverage_score ?? "",
    "Risk-Adjusted ROI": toNumber(row.risk_adjusted_roi),
    "12-Month Gross Benefit": toNumber(row.benefit_12m_gross),
    "Decision Type": row.decision_type ?? "",
  };

  for (const [gateName, isChecked] of Object.entries(governanceChecks)) {
    properties[gateName] = isChecked;
  }

  return {
    id: row.id,
    name: row.name,
    createdAt: toIsoTimestamp(row.created_at),
    bodyText: row.body_text ?? "",
    properties,
    governanceChecks,
  };
}

export async function upsertDecisionRecord(input: DecisionUpsertInput): Promise<void> {
  await query(
    `
      INSERT INTO decisions (
        id,
        name,
        status,
        owner,
        review_date,
        summary,
        primary_kpi,
        investment_required,
        strategic_objective,
        confidence,
        baseline,
        target,
        time_horizon,
        probability_of_success,
        leverage_score,
        risk_adjusted_roi,
        benefit_12m_gross,
        decision_type,
        details_url,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        COALESCE($3, 'Proposed'),
        $4,
        $5::timestamptz,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12,
        $13,
        $14,
        $15,
        $16,
        $17,
        $18,
        $19,
        COALESCE($20::timestamptz, NOW()),
        NOW()
      )
      ON CONFLICT (id)
      DO UPDATE SET
        name = EXCLUDED.name,
        status = EXCLUDED.status,
        owner = EXCLUDED.owner,
        review_date = EXCLUDED.review_date,
        summary = EXCLUDED.summary,
        primary_kpi = EXCLUDED.primary_kpi,
        investment_required = EXCLUDED.investment_required,
        strategic_objective = EXCLUDED.strategic_objective,
        confidence = EXCLUDED.confidence,
        baseline = EXCLUDED.baseline,
        target = EXCLUDED.target,
        time_horizon = EXCLUDED.time_horizon,
        probability_of_success = EXCLUDED.probability_of_success,
        leverage_score = EXCLUDED.leverage_score,
        risk_adjusted_roi = EXCLUDED.risk_adjusted_roi,
        benefit_12m_gross = EXCLUDED.benefit_12m_gross,
        decision_type = EXCLUDED.decision_type,
        details_url = EXCLUDED.details_url,
        updated_at = NOW()
    `,
    [
      input.id,
      input.name,
      input.status ?? "Proposed",
      input.owner ?? null,
      input.reviewDate ?? null,
      input.summary ?? null,
      input.primaryKpi ?? null,
      input.investmentRequired ?? null,
      input.strategicObjective ?? null,
      input.confidence ?? null,
      input.baseline ?? null,
      input.target ?? null,
      input.timeHorizon ?? null,
      input.probabilityOfSuccess ?? null,
      input.leverageScore ?? null,
      input.riskAdjustedRoi ?? null,
      input.benefit12mGross ?? null,
      input.decisionType ?? null,
      input.detailsUrl ?? null,
      input.createdAt ?? null,
    ],
  );
}

export async function upsertDecisionDocument(decisionId: string, bodyText: string): Promise<void> {
  await query(
    `
      INSERT INTO decision_documents (
        decision_id,
        body_text,
        created_at,
        updated_at
      )
      VALUES ($1, $2, NOW(), NOW())
      ON CONFLICT (decision_id)
      DO UPDATE SET
        body_text = EXCLUDED.body_text,
        updated_at = NOW()
    `,
    [decisionId, bodyText],
  );
}

export async function setDecisionGovernanceChecks(decisionId: string, checks: Record<string, boolean>): Promise<void> {
  await query(
    `
      DELETE FROM decision_governance_checks
      WHERE decision_id = $1
    `,
    [decisionId],
  );

  const entries = Object.entries(checks);
  if (entries.length === 0) {
    return;
  }

  const gateNames = entries.map(([gateName]) => gateName);
  const gateValues = entries.map(([, isChecked]) => isChecked);

  await query(
    `
      INSERT INTO decision_governance_checks (
        decision_id,
        gate_name,
        is_checked,
        updated_at
      )
      SELECT
        $1,
        gate_name,
        is_checked,
        NOW()
      FROM unnest($2::text[], $3::boolean[]) AS t(gate_name, is_checked)
      ON CONFLICT (decision_id, gate_name)
      DO UPDATE SET
        is_checked = EXCLUDED.is_checked,
        updated_at = NOW()
    `,
    [decisionId, gateNames, gateValues],
  );
}

export async function updateDecisionStatus(decisionId: string, status: string): Promise<void> {
  const result = await query<DecisionIdRow>(
    `
      UPDATE decisions
      SET status = $2, updated_at = NOW()
      WHERE id = $1
      RETURNING id
    `,
    [decisionId, status],
  );

  if (result.rowCount === 0) {
    throw new Error(`Decision ${decisionId} was not found`);
  }
}

export async function upsertGovernanceChecks(decisionId: string, gatesToMarkTrue: string[]): Promise<void> {
  const uniqueGates = [...new Set(gatesToMarkTrue.map((gate) => gate.trim()).filter((gate) => gate.length > 0))];
  if (uniqueGates.length === 0) {
    return;
  }

  await query(
    `
      INSERT INTO decision_governance_checks (decision_id, gate_name, is_checked, updated_at)
      SELECT $1, gate_name, TRUE, NOW()
      FROM unnest($2::text[]) AS gate_name
      ON CONFLICT (decision_id, gate_name)
      DO UPDATE
      SET is_checked = TRUE, updated_at = NOW()
    `,
    [decisionId, uniqueGates],
  );
}

export async function upsertDecisionReview(decisionId: string, agentName: string, review: ReviewOutput): Promise<void> {
  await query(
    `
      INSERT INTO decision_reviews (
        decision_id,
        agent_name,
        thesis,
        score,
        confidence,
        blocked,
        blockers,
        risks,
        required_changes,
        approval_conditions,
        apga_impact_view,
        governance_checks_met,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7::jsonb,
        $8::jsonb,
        $9::jsonb,
        $10::jsonb,
        $11,
        $12::jsonb,
        NOW(),
        NOW()
      )
      ON CONFLICT (decision_id, agent_name)
      DO UPDATE SET
        thesis = EXCLUDED.thesis,
        score = EXCLUDED.score,
        confidence = EXCLUDED.confidence,
        blocked = EXCLUDED.blocked,
        blockers = EXCLUDED.blockers,
        risks = EXCLUDED.risks,
        required_changes = EXCLUDED.required_changes,
        approval_conditions = EXCLUDED.approval_conditions,
        apga_impact_view = EXCLUDED.apga_impact_view,
        governance_checks_met = EXCLUDED.governance_checks_met,
        updated_at = NOW()
    `,
    [
      decisionId,
      agentName,
      review.thesis,
      review.score,
      review.confidence,
      review.blocked,
      JSON.stringify(review.blockers),
      JSON.stringify(review.risks),
      JSON.stringify(review.required_changes),
      JSON.stringify(review.approval_conditions),
      review.apga_impact_view,
      JSON.stringify(review.governance_checks_met),
    ],
  );
}

export async function upsertDecisionSynthesis(decisionId: string, synthesis: ChairpersonSynthesis): Promise<void> {
  await query(
    `
      INSERT INTO decision_synthesis (
        decision_id,
        executive_summary,
        final_recommendation,
        conflicts,
        blockers,
        required_revisions,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, NOW(), NOW())
      ON CONFLICT (decision_id)
      DO UPDATE SET
        executive_summary = EXCLUDED.executive_summary,
        final_recommendation = EXCLUDED.final_recommendation,
        conflicts = EXCLUDED.conflicts,
        blockers = EXCLUDED.blockers,
        required_revisions = EXCLUDED.required_revisions,
        updated_at = NOW()
    `,
    [
      decisionId,
      synthesis.executive_summary,
      synthesis.final_recommendation,
      JSON.stringify(synthesis.conflicts),
      JSON.stringify(synthesis.blockers),
      JSON.stringify(synthesis.required_revisions),
    ],
  );
}

export async function upsertDecisionPrd(decisionId: string, prd: PRDOutput): Promise<void> {
  await query(
    `
      INSERT INTO decision_prds (
        decision_id,
        title,
        status,
        scope,
        milestones,
        telemetry,
        risks,
        sections,
        created_at,
        updated_at
      )
      VALUES ($1, $2, 'Draft', $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, NOW(), NOW())
      ON CONFLICT (decision_id)
      DO UPDATE SET
        title = EXCLUDED.title,
        scope = EXCLUDED.scope,
        milestones = EXCLUDED.milestones,
        telemetry = EXCLUDED.telemetry,
        risks = EXCLUDED.risks,
        sections = EXCLUDED.sections,
        status = 'Draft',
        updated_at = NOW()
    `,
    [
      decisionId,
      prd.title,
      JSON.stringify(prd.scope),
      JSON.stringify(prd.milestones),
      JSON.stringify(prd.telemetry),
      JSON.stringify(prd.risks),
      JSON.stringify(prd.sections),
    ],
  );
}

export async function recordWorkflowRun(
  decisionId: string,
  dqs: number,
  gateDecision: string,
  workflowStatus: string,
  state: Record<string, unknown>,
): Promise<void> {
  await query(
    `
      INSERT INTO workflow_runs (
        decision_id,
        dqs,
        gate_decision,
        workflow_status,
        state_json,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
    `,
    [decisionId, dqs, gateDecision, workflowStatus, JSON.stringify(state)],
  );
}

export interface WorkflowRunRecord {
  id: number;
  decisionId: string;
  dqs: number;
  gateDecision: string;
  workflowStatus: string;
  decisionName: string | null;
  stateStatus: string | null;
  missingSections: string[];
  createdAt: string;
}

interface WorkflowRunRow extends QueryResultRow {
  id: string | number;
  decision_id: string;
  dqs: string | number;
  gate_decision: string;
  workflow_status: string;
  decision_name: string | null;
  state_status: string | null;
  missing_sections: unknown;
  created_at: Date | string;
}

export async function listWorkflowRuns(decisionId: string, limit = 20): Promise<WorkflowRunRecord[]> {
  const normalizedDecisionId = typeof decisionId === "string" ? decisionId.trim() : "";
  if (normalizedDecisionId.length === 0) {
    throw new Error("decisionId is required");
  }

  const normalizedLimit = Math.max(1, Math.min(100, Number.isFinite(limit) ? Math.round(limit) : 20));

  const result = await query<WorkflowRunRow>(
    `
      SELECT
        id,
        decision_id,
        dqs,
        gate_decision,
        workflow_status,
        state_json->>'decision_name' AS decision_name,
        state_json->>'status' AS state_status,
        state_json->'missing_sections' AS missing_sections,
        created_at
      FROM workflow_runs
      WHERE decision_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
    [normalizedDecisionId, normalizedLimit],
  );

  return result.rows.map((row) => ({
    id: Math.max(1, Math.round(toNumber(row.id) ?? 0)),
    decisionId: row.decision_id,
    dqs: toNumber(row.dqs) ?? 0,
    gateDecision: row.gate_decision,
    workflowStatus: row.workflow_status,
    decisionName: typeof row.decision_name === "string" ? row.decision_name : null,
    stateStatus: typeof row.state_status === "string" ? row.state_status : null,
    missingSections: toStringArray(row.missing_sections),
    createdAt: toIsoTimestamp(row.created_at),
  }));
}

interface DecisionReviewRow extends QueryResultRow {
  agent_name: string;
  agent_role: string;
  thesis: string;
  score: string | number;
  confidence: string | number;
  blocked: boolean;
  blockers: unknown;
  risks: unknown;
  required_changes: unknown;
  approval_conditions: unknown;
  apga_impact_view: string;
  governance_checks_met: unknown;
}

interface DecisionSynthesisRow extends QueryResultRow {
  executive_summary: string;
  final_recommendation: "Approved" | "Challenged" | "Blocked";
  conflicts: unknown;
  blockers: unknown;
  required_revisions: unknown;
}

interface DecisionPrdRow extends QueryResultRow {
  title: string;
  scope: unknown;
  milestones: unknown;
  telemetry: unknown;
  risks: unknown;
  sections: unknown;
}

export async function loadPersistedDecisionOutputs(decisionId: string): Promise<{
  reviews: Record<string, ReviewOutput>;
  synthesis: ChairpersonSynthesis | null;
  prd: PRDOutput | null;
}> {
  const [reviewResult, synthesisResult, prdResult] = await Promise.all([
    query<DecisionReviewRow>(
      `
        SELECT
          dr.agent_name,
          COALESCE(ac.role, dr.agent_name) AS agent_role,
          dr.thesis,
          dr.score,
          dr.confidence,
          dr.blocked,
          dr.blockers,
          dr.risks,
          dr.required_changes,
          dr.approval_conditions,
          dr.apga_impact_view,
          dr.governance_checks_met
        FROM decision_reviews dr
        LEFT JOIN agent_configs ac ON ac.agent_id = dr.agent_name
        WHERE dr.decision_id = $1
      `,
      [decisionId],
    ),
    query<DecisionSynthesisRow>(
      `
        SELECT
          executive_summary,
          final_recommendation,
          conflicts,
          blockers,
          required_revisions
        FROM decision_synthesis
        WHERE decision_id = $1
        LIMIT 1
      `,
      [decisionId],
    ),
    query<DecisionPrdRow>(
      `
        SELECT
          title,
          scope,
          milestones,
          telemetry,
          risks,
          sections
        FROM decision_prds
        WHERE decision_id = $1
        LIMIT 1
      `,
      [decisionId],
    ),
  ]);

  const reviews: Record<string, ReviewOutput> = {};
  for (const row of reviewResult.rows) {
    reviews[row.agent_name.toLowerCase()] = {
      agent: row.agent_role,
      thesis: row.thesis,
      score: Math.max(1, Math.min(10, Math.round(toNumber(row.score) ?? 1))),
      confidence: Math.max(0, Math.min(1, toNumber(row.confidence) ?? 0)),
      blocked: Boolean(row.blocked),
      blockers: toStringArray(row.blockers),
      risks: Array.isArray(row.risks) ? (row.risks as ReviewOutput["risks"]) : [],
      required_changes: toStringArray(row.required_changes),
      approval_conditions: toStringArray(row.approval_conditions),
      apga_impact_view: row.apga_impact_view ?? "",
      governance_checks_met: toBooleanMap(row.governance_checks_met),
    };
  }

  const synthesisRow = synthesisResult.rows[0];
  const synthesis = synthesisRow
    ? {
        executive_summary: synthesisRow.executive_summary,
        final_recommendation: synthesisRow.final_recommendation,
        conflicts: toStringArray(synthesisRow.conflicts),
        blockers: toStringArray(synthesisRow.blockers),
        required_revisions: toStringArray(synthesisRow.required_revisions),
      }
    : null;

  const prdRow = prdResult.rows[0];
  const prd = prdRow
    ? {
        title: prdRow.title,
        scope: toStringArray(prdRow.scope),
        milestones: toStringArray(prdRow.milestones),
        telemetry: toStringArray(prdRow.telemetry),
        risks: toStringArray(prdRow.risks),
        sections:
          prdRow.sections && typeof prdRow.sections === "object" && !Array.isArray(prdRow.sections)
            ? (prdRow.sections as Record<string, string[]>)
            : {},
      }
    : null;

  return { reviews, synthesis, prd };
}

export async function checkDatabaseHealth(): Promise<void> {
  await query("SELECT 1");
}
