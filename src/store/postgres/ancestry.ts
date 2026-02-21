import type { QueryResultRow } from "pg";

import { query } from "./client";
import { asString, toIsoTimestamp, toNumber, toNumberArray, toStringArray } from "./serializers";
import type { DecisionAncestryCandidate, DecisionAncestryEmbedding } from "./types";

interface DecisionAncestryRow extends QueryResultRow {
  id: string;
  name: string;
  summary: string | null;
  body_text: string | null;
  gate_decision: string | null;
  dqs: string | number | null;
  final_recommendation: "Approved" | "Challenged" | "Blocked" | null;
  executive_summary: string | null;
  blockers: unknown;
  required_revisions: unknown;
  last_run_at: Date | string | null;
}

interface DecisionAncestryEmbeddingRow extends QueryResultRow {
  decision_id: string;
  source_hash: string;
  embedding_provider: string;
  embedding_model: string;
  embedding_dimensions: number | string;
  embedding_json: unknown;
  updated_at: Date | string | null;
}

export async function listDecisionAncestryCandidates(
  decisionId: string,
  limit = 50,
): Promise<DecisionAncestryCandidate[]> {
  const normalizedDecisionId = typeof decisionId === "string" ? decisionId.trim() : "";
  if (normalizedDecisionId.length === 0) {
    throw new Error("decisionId is required");
  }

  const normalizedLimit = Math.max(1, Math.min(250, Number.isFinite(limit) ? Math.round(limit) : 50));

  const result = await query<DecisionAncestryRow>(
    `
      SELECT
        d.id,
        d.name,
        d.summary,
        doc.body_text,
        latest_run.gate_decision,
        latest_run.dqs,
        latest_run.created_at AS last_run_at,
        ds.final_recommendation,
        ds.executive_summary,
        ds.blockers,
        ds.required_revisions
      FROM decisions d
      LEFT JOIN decision_documents doc
        ON doc.decision_id = d.id
      LEFT JOIN LATERAL (
        SELECT wr.gate_decision, wr.dqs, wr.created_at
        FROM workflow_runs wr
        WHERE wr.decision_id = d.id
        ORDER BY wr.created_at DESC
        LIMIT 1
      ) AS latest_run
        ON TRUE
      LEFT JOIN decision_synthesis ds
        ON ds.decision_id = d.id
      WHERE d.id <> $1
      ORDER BY COALESCE(latest_run.created_at, d.review_date, d.created_at) DESC
      LIMIT $2
    `,
    [normalizedDecisionId, normalizedLimit],
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: asString(row.name, "").trim() || `Decision ${row.id.slice(0, 8)}`,
    summary: asString(row.summary, "").trim(),
    bodyText: asString(row.body_text, ""),
    gateDecision: typeof row.gate_decision === "string" ? row.gate_decision : null,
    dqs: toNumber(row.dqs),
    finalRecommendation: row.final_recommendation,
    executiveSummary: asString(row.executive_summary, "").trim(),
    blockers: toStringArray(row.blockers),
    requiredRevisions: toStringArray(row.required_revisions),
    lastRunAt: toIsoTimestamp(row.last_run_at),
  }));
}

export async function getDecisionAncestryEmbedding(decisionId: string): Promise<DecisionAncestryEmbedding | null> {
  const normalizedDecisionId = typeof decisionId === "string" ? decisionId.trim() : "";
  if (normalizedDecisionId.length === 0) {
    throw new Error("decisionId is required");
  }

  const result = await query<DecisionAncestryEmbeddingRow>(
    `
      SELECT
        decision_id,
        source_hash,
        embedding_provider,
        embedding_model,
        embedding_dimensions,
        embedding_json,
        updated_at
      FROM decision_ancestry_embeddings
      WHERE decision_id = $1
      LIMIT 1
    `,
    [normalizedDecisionId],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    decisionId: row.decision_id,
    sourceHash: asString(row.source_hash, ""),
    embeddingProvider: asString(row.embedding_provider, ""),
    embeddingModel: asString(row.embedding_model, ""),
    embeddingDimensions: Math.max(1, Math.round(toNumber(row.embedding_dimensions) ?? 0)),
    embedding: toNumberArray(row.embedding_json),
    updatedAt: toIsoTimestamp(row.updated_at),
  };
}

export async function listDecisionAncestryEmbeddings(
  decisionIds: string[],
): Promise<Record<string, DecisionAncestryEmbedding>> {
  const normalized = [...new Set(decisionIds.map((value) => value.trim()).filter((value) => value.length > 0))];
  if (normalized.length === 0) {
    return {};
  }

  const result = await query<DecisionAncestryEmbeddingRow>(
    `
      SELECT
        decision_id,
        source_hash,
        embedding_provider,
        embedding_model,
        embedding_dimensions,
        embedding_json,
        updated_at
      FROM decision_ancestry_embeddings
      WHERE decision_id = ANY($1::text[])
    `,
    [normalized],
  );

  const byDecisionId: Record<string, DecisionAncestryEmbedding> = {};
  for (const row of result.rows) {
    byDecisionId[row.decision_id] = {
      decisionId: row.decision_id,
      sourceHash: asString(row.source_hash, ""),
      embeddingProvider: asString(row.embedding_provider, ""),
      embeddingModel: asString(row.embedding_model, ""),
      embeddingDimensions: Math.max(1, Math.round(toNumber(row.embedding_dimensions) ?? 0)),
      embedding: toNumberArray(row.embedding_json),
      updatedAt: toIsoTimestamp(row.updated_at),
    };
  }

  return byDecisionId;
}

interface UpsertDecisionAncestryEmbeddingInput {
  decisionId: string;
  sourceText: string;
  sourceHash: string;
  embeddingProvider: string;
  embeddingModel: string;
  embeddingDimensions: number;
  embedding: number[];
}

export async function upsertDecisionAncestryEmbedding(input: UpsertDecisionAncestryEmbeddingInput): Promise<void> {
  const decisionId = input.decisionId.trim();
  if (decisionId.length === 0) {
    throw new Error("decisionId is required");
  }

  const sourceHash = input.sourceHash.trim();
  if (sourceHash.length === 0) {
    throw new Error("sourceHash is required");
  }

  const embedding = input.embedding.filter((entry) => Number.isFinite(entry));
  if (embedding.length === 0) {
    throw new Error("embedding vector is required");
  }

  const dimensions = Math.max(1, Math.round(input.embeddingDimensions || embedding.length));

  await query(
    `
      INSERT INTO decision_ancestry_embeddings (
        decision_id,
        source_hash,
        source_text,
        embedding_provider,
        embedding_model,
        embedding_dimensions,
        embedding_json,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW(), NOW())
      ON CONFLICT (decision_id)
      DO UPDATE SET
        source_hash = EXCLUDED.source_hash,
        source_text = EXCLUDED.source_text,
        embedding_provider = EXCLUDED.embedding_provider,
        embedding_model = EXCLUDED.embedding_model,
        embedding_dimensions = EXCLUDED.embedding_dimensions,
        embedding_json = EXCLUDED.embedding_json,
        updated_at = NOW()
    `,
    [
      decisionId,
      sourceHash,
      input.sourceText,
      input.embeddingProvider.trim() || "unknown",
      input.embeddingModel.trim() || "unknown",
      dimensions,
      JSON.stringify(embedding),
    ],
  );
}
