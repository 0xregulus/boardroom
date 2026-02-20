import {
  DecisionAncestryCandidate,
  DecisionAncestryEmbedding,
  getDecisionAncestryEmbedding,
  listDecisionAncestryCandidates,
  listDecisionAncestryEmbeddings,
  upsertDecisionAncestryEmbedding,
} from "../store/postgres";
import { buildEmbeddingSourceHash, cosineSimilarityVectors, embedText } from "./embedder";

export interface DecisionAncestryMatch {
  decision_id: string;
  decision_name: string;
  similarity: number;
  outcome: {
    gate_decision: string | null;
    final_recommendation: "Approved" | "Challenged" | "Blocked" | null;
    dqs: number | null;
    run_at: string;
  };
  lessons: string[];
  summary: string;
}

export interface DecisionAncestryContext {
  similar_decisions: DecisionAncestryMatch[];
  retrieval_method: "vector-db" | "lexical-fallback";
}

export interface RetrieveDecisionAncestryInput {
  decisionId: string;
  decisionName?: string;
  decisionSummary?: string;
  bodyText: string;
  topK?: number;
  candidateLimit?: number;
}

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "if",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

function termFrequency(tokens: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const token of tokens) {
    map.set(token, (map.get(token) ?? 0) + 1);
  }
  return map;
}

function cosineSimilarity(left: Map<string, number>, right: Map<string, number>): number {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (const value of left.values()) {
    leftNorm += value * value;
  }

  for (const value of right.values()) {
    rightNorm += value * value;
  }

  for (const [term, leftValue] of left.entries()) {
    const rightValue = right.get(term);
    if (rightValue) {
      dot += leftValue * rightValue;
    }
  }

  if (leftNorm <= 0 || rightNorm <= 0) {
    return 0;
  }

  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function candidateText(candidate: DecisionAncestryCandidate): string {
  return [candidate.name, candidate.summary, candidate.bodyText, candidate.executiveSummary].join("\n");
}

function candidateEmbeddingSource(candidate: DecisionAncestryCandidate): string {
  return [candidate.name, candidate.summary, candidate.bodyText, candidate.executiveSummary].join("\n");
}

function trimToWords(text: string, wordLimit: number): string {
  const tokens = text.trim().split(/\s+/);
  if (tokens.length <= wordLimit) {
    return text.trim();
  }
  return `${tokens.slice(0, wordLimit).join(" ")}...`;
}

function summarizeOutcome(candidate: DecisionAncestryCandidate): string[] {
  const lessons: string[] = [];
  const recommendation = candidate.finalRecommendation ?? candidate.gateDecision ?? "Unknown";
  const dqs =
    typeof candidate.dqs === "number" && Number.isFinite(candidate.dqs)
      ? `DQS ${candidate.dqs.toFixed(2)}`
      : "DQS unavailable";
  lessons.push(`Outcome: ${recommendation}; ${dqs}.`);

  for (const blocker of candidate.blockers.slice(0, 2)) {
    lessons.push(`Blocker: ${blocker}`);
  }

  for (const revision of candidate.requiredRevisions.slice(0, 2)) {
    lessons.push(`Required revision: ${revision}`);
  }

  if (lessons.length === 1) {
    lessons.push("No explicit blockers or required revisions were recorded.");
  }

  return lessons;
}

function buildQueryText(input: RetrieveDecisionAncestryInput): string {
  return [normalizeText(input.decisionName), normalizeText(input.decisionSummary), normalizeText(input.bodyText)].join("\n");
}

export function retrieveMemoryContext(): Record<string, unknown> {
  return {};
}

async function ensureDecisionEmbedding(
  decisionId: string,
  sourceText: string,
): Promise<DecisionAncestryEmbedding | null> {
  const sourceHash = buildEmbeddingSourceHash(sourceText);
  const existing = await getDecisionAncestryEmbedding(decisionId);

  if (existing && existing.sourceHash === sourceHash && existing.embedding.length > 0) {
    return existing;
  }

  const embedded = await embedText(sourceText, { allowFallback: true });
  if (embedded.vector.length === 0) {
    return null;
  }

  await upsertDecisionAncestryEmbedding({
    decisionId,
    sourceText,
    sourceHash,
    embeddingProvider: embedded.provider,
    embeddingModel: embedded.model,
    embeddingDimensions: embedded.dimensions,
    embedding: embedded.vector,
  });

  return {
    decisionId,
    sourceHash,
    embeddingProvider: embedded.provider,
    embeddingModel: embedded.model,
    embeddingDimensions: embedded.dimensions,
    embedding: embedded.vector,
    updatedAt: "",
  };
}

async function ensureCandidateEmbeddings(
  candidates: DecisionAncestryCandidate[],
  existingByDecisionId: Record<string, DecisionAncestryEmbedding>,
): Promise<Record<string, DecisionAncestryEmbedding>> {
  const output: Record<string, DecisionAncestryEmbedding> = { ...existingByDecisionId };
  const missing = candidates
    .map((candidate) => {
      const sourceText = candidateEmbeddingSource(candidate);
      const sourceHash = buildEmbeddingSourceHash(sourceText);
      const existing = output[candidate.id];

      if (existing && existing.sourceHash === sourceHash && existing.embedding.length > 0) {
        return null;
      }

      return { candidate, sourceHash, sourceText };
    })
    .filter((entry): entry is { candidate: DecisionAncestryCandidate; sourceHash: string; sourceText: string } => Boolean(entry));

  if (missing.length === 0) {
    return output;
  }

  await Promise.all(
    missing.map(async ({ candidate, sourceHash, sourceText }) => {
      const embedded = await embedText(sourceText, { allowFallback: true });
      if (embedded.vector.length === 0) {
        return;
      }

      await upsertDecisionAncestryEmbedding({
        decisionId: candidate.id,
        sourceText,
        sourceHash,
        embeddingProvider: embedded.provider,
        embeddingModel: embedded.model,
        embeddingDimensions: embedded.dimensions,
        embedding: embedded.vector,
      });

      output[candidate.id] = {
        decisionId: candidate.id,
        sourceHash,
        embeddingProvider: embedded.provider,
        embeddingModel: embedded.model,
        embeddingDimensions: embedded.dimensions,
        embedding: embedded.vector,
        updatedAt: "",
      };
    }),
  );

  return output;
}

function scoreByVectorSimilarity(
  queryEmbedding: number[],
  candidates: DecisionAncestryCandidate[],
  embeddingsByDecisionId: Record<string, DecisionAncestryEmbedding>,
  topK: number,
): DecisionAncestryMatch[] {
  const scored = candidates
    .map((candidate) => {
      const candidateEmbedding = embeddingsByDecisionId[candidate.id]?.embedding ?? [];
      const similarity = cosineSimilarityVectors(queryEmbedding, candidateEmbedding);
      return { candidate, similarity };
    })
    .filter((entry) => entry.similarity > 0)
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, topK);

  return scored.map(({ candidate, similarity }) => ({
    decision_id: candidate.id,
    decision_name: candidate.name,
    similarity: Number(similarity.toFixed(4)),
    outcome: {
      gate_decision: candidate.gateDecision,
      final_recommendation: candidate.finalRecommendation,
      dqs: candidate.dqs,
      run_at: candidate.lastRunAt,
    },
    lessons: summarizeOutcome(candidate),
    summary: trimToWords(candidate.executiveSummary || candidate.summary || candidate.bodyText, 80),
  }));
}

function scoreByLexicalFallback(
  queryText: string,
  candidates: DecisionAncestryCandidate[],
  topK: number,
): DecisionAncestryMatch[] {
  const queryVector = termFrequency(tokenize(queryText));
  if (queryVector.size === 0) {
    return [];
  }

  const scored = candidates
    .map((candidate) => {
      const similarity = cosineSimilarity(queryVector, termFrequency(tokenize(candidateText(candidate))));
      return { candidate, similarity };
    })
    .filter((entry) => entry.similarity > 0)
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, topK);

  return scored.map(({ candidate, similarity }) => ({
    decision_id: candidate.id,
    decision_name: candidate.name,
    similarity: Number(similarity.toFixed(4)),
    outcome: {
      gate_decision: candidate.gateDecision,
      final_recommendation: candidate.finalRecommendation,
      dqs: candidate.dqs,
      run_at: candidate.lastRunAt,
    },
    lessons: summarizeOutcome(candidate),
    summary: trimToWords(candidate.executiveSummary || candidate.summary || candidate.bodyText, 80),
  }));
}

export async function retrieveDecisionAncestryContext(
  input: RetrieveDecisionAncestryInput,
): Promise<DecisionAncestryContext> {
  const normalizedDecisionId = normalizeText(input.decisionId);
  if (normalizedDecisionId.length === 0) {
    return { similar_decisions: [], retrieval_method: "lexical-fallback" };
  }

  const topK = Math.max(1, Math.min(10, Math.round(input.topK ?? 3)));
  const candidateLimit = Math.max(10, Math.min(250, Math.round(input.candidateLimit ?? 60)));
  const queryText = buildQueryText(input);
  if (queryText.trim().length === 0) {
    return { similar_decisions: [], retrieval_method: "lexical-fallback" };
  }

  const candidates = await listDecisionAncestryCandidates(normalizedDecisionId, candidateLimit);
  if (candidates.length === 0) {
    return { similar_decisions: [], retrieval_method: "lexical-fallback" };
  }

  try {
    const queryEmbedding = await ensureDecisionEmbedding(normalizedDecisionId, queryText);
    if (queryEmbedding?.embedding?.length) {
      const decisionIds = candidates.map((candidate) => candidate.id);
      const existingEmbeddings = await listDecisionAncestryEmbeddings(decisionIds);
      const embeddingsByDecisionId = await ensureCandidateEmbeddings(candidates, existingEmbeddings);
      const vectorMatches = scoreByVectorSimilarity(queryEmbedding.embedding, candidates, embeddingsByDecisionId, topK);

      if (vectorMatches.length > 0) {
        return {
          similar_decisions: vectorMatches,
          retrieval_method: "vector-db",
        };
      }
    }
  } catch {
    // Fall through to lexical scoring when embeddings are unavailable.
  }

  const lexicalMatches = scoreByLexicalFallback(queryText, candidates, topK);

  return {
    similar_decisions: lexicalMatches,
    retrieval_method: "lexical-fallback",
  };
}
