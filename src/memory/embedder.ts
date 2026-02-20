import { createHash } from "node:crypto";

import OpenAI from "openai";
import { isSimulationModeEnabled, resolveSimulationDelayMs, sleepMs } from "../simulation/mode";

export type EmbeddingProvider = "openai" | "local-hash";

export interface EmbeddingResult {
  provider: EmbeddingProvider;
  model: string;
  dimensions: number;
  vector: number[];
}

export interface EmbedTextOptions {
  provider?: EmbeddingProvider;
  dimensions?: number;
  allowFallback?: boolean;
}

const DEFAULT_OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_LOCAL_EMBEDDING_MODEL = "local-hash-v1";
const DEFAULT_LOCAL_DIMENSIONS = 256;
const MAX_EMBED_TEXT_CHARS = 24_000;
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

let cachedOpenAIClient: OpenAI | null = null;

function normalizeProvider(value: unknown): EmbeddingProvider {
  if (typeof value !== "string") {
    return "local-hash";
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "openai" ? "openai" : "local-hash";
}

function normalizeText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/\r\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_EMBED_TEXT_CHARS);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

function l2Normalize(vector: number[]): number[] {
  let norm = 0;
  for (const value of vector) {
    norm += value * value;
  }
  if (norm <= 0) {
    return vector.map(() => 0);
  }

  const scale = 1 / Math.sqrt(norm);
  return vector.map((value) => Number((value * scale).toFixed(8)));
}

function embedWithLocalHash(text: string, dimensions: number): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  const tokens = tokenize(text);

  if (tokens.length === 0) {
    return vector;
  }

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const digest = createHash("sha256").update(token).digest();
    const bucket = digest.readUInt16BE(0) % dimensions;
    const polarity = (digest[2] & 1) === 0 ? 1 : -1;
    const tfBoost = 1 + Math.min(3, index / Math.max(tokens.length, 1));
    vector[bucket] += polarity * tfBoost;

    // Add a second bucket to reduce collisions for common tokens.
    const secondBucket = digest.readUInt16BE(3) % dimensions;
    const secondaryPolarity = (digest[5] & 1) === 0 ? 1 : -1;
    vector[secondBucket] += secondaryPolarity * 0.75;
  }

  return l2Normalize(vector);
}

function getOpenAIClient(): OpenAI {
  if (cachedOpenAIClient) {
    return cachedOpenAIClient;
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  cachedOpenAIClient = new OpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL?.trim() || undefined,
  });
  return cachedOpenAIClient;
}

async function embedWithOpenAI(text: string): Promise<EmbeddingResult> {
  const model = process.env.BOARDROOM_EMBEDDING_MODEL?.trim() || DEFAULT_OPENAI_EMBEDDING_MODEL;
  const response = await getOpenAIClient().embeddings.create({
    model,
    input: text,
  });
  const embedding = response.data[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error("OpenAI embeddings response was empty.");
  }

  const normalizedVector = l2Normalize(
    embedding.map((entry) => (typeof entry === "number" && Number.isFinite(entry) ? entry : 0)),
  );
  return {
    provider: "openai",
    model,
    dimensions: normalizedVector.length,
    vector: normalizedVector,
  };
}

export function getEmbeddingProvider(): EmbeddingProvider {
  return normalizeProvider(process.env.BOARDROOM_EMBEDDING_PROVIDER);
}

export function buildEmbeddingSourceHash(text: string): string {
  const normalized = normalizeText(text);
  return createHash("sha256").update(normalized).digest("hex");
}

export function cosineSimilarityVectors(left: number[], right: number[]): number {
  const size = Math.min(left.length, right.length);
  if (size === 0) {
    return 0;
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (let index = 0; index < size; index += 1) {
    const leftValue = Number.isFinite(left[index]) ? left[index] : 0;
    const rightValue = Number.isFinite(right[index]) ? right[index] : 0;
    dot += leftValue * rightValue;
    leftNorm += leftValue * leftValue;
    rightNorm += rightValue * rightValue;
  }

  if (leftNorm <= 0 || rightNorm <= 0) {
    return 0;
  }

  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

export async function embedText(input: string, options?: EmbedTextOptions): Promise<EmbeddingResult> {
  const text = normalizeText(input);
  const simulationMode = isSimulationModeEnabled();
  const requestedProvider = options?.provider ?? getEmbeddingProvider();
  const provider = simulationMode && requestedProvider === "openai" ? "local-hash" : requestedProvider;
  const allowFallback = options?.allowFallback ?? true;
  const dimensions = Math.max(64, Math.min(1536, Math.round(options?.dimensions ?? DEFAULT_LOCAL_DIMENSIONS)));

  if (text.length === 0) {
    const vector = new Array<number>(dimensions).fill(0);
    return {
      provider: "local-hash",
      model: DEFAULT_LOCAL_EMBEDDING_MODEL,
      dimensions,
      vector,
    };
  }

  if (provider === "openai") {
    try {
      return await embedWithOpenAI(text);
    } catch (error) {
      if (!allowFallback) {
        throw error;
      }
    }
  }

  if (simulationMode && requestedProvider === "openai") {
    await sleepMs(resolveSimulationDelayMs(`embedding:${text.slice(0, 120)}`));
  }

  const vector = embedWithLocalHash(text, dimensions);
  return {
    provider: "local-hash",
    model: DEFAULT_LOCAL_EMBEDDING_MODEL,
    dimensions,
    vector,
  };
}
