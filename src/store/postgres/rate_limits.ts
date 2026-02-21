import { query } from "./client";
import { toIsoTimestamp, toNumber } from "./serializers";

export interface RateLimitCheckInput {
  bucketKey: string;
  limit: number;
  windowMs: number;
  now?: number;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  count: number;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

export async function checkRateLimitBucket(input: RateLimitCheckInput): Promise<RateLimitCheckResult> {
  const bucketKey = typeof input.bucketKey === "string" ? input.bucketKey.trim().slice(0, 512) : "";
  if (bucketKey.length === 0) {
    throw new Error("bucketKey is required");
  }

  const limit = Math.max(1, Math.min(10_000, Number.isFinite(input.limit) ? Math.round(input.limit) : 1));
  const windowMs = Math.max(
    1_000,
    Math.min(24 * 60 * 60 * 1_000, Number.isFinite(input.windowMs) ? Math.round(input.windowMs) : 60_000),
  );
  const now = typeof input.now === "number" && Number.isFinite(input.now) ? Math.round(input.now) : Date.now();
  const resetAtMs = now + windowMs;

  const result = await query<{ count: string | number; reset_at: Date | string }>(
    `
      WITH upsert AS (
        INSERT INTO rate_limits (bucket_key, count, reset_at, updated_at)
        VALUES ($1, 1, TO_TIMESTAMP($2::double precision / 1000.0), NOW())
        ON CONFLICT (bucket_key)
        DO UPDATE SET
          count = CASE
            WHEN rate_limits.reset_at <= NOW() THEN 1
            ELSE rate_limits.count + 1
          END,
          reset_at = CASE
            WHEN rate_limits.reset_at <= NOW() THEN TO_TIMESTAMP($2::double precision / 1000.0)
            ELSE rate_limits.reset_at
          END,
          updated_at = NOW()
        RETURNING count, reset_at
      )
      SELECT count, reset_at
      FROM upsert
    `,
    [bucketKey, resetAtMs],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("Rate limit update failed");
  }

  const count = Math.max(1, Math.round(toNumber(row.count) ?? 1));
  const parsedResetAt = new Date(toIsoTimestamp(row.reset_at)).getTime();
  const resetAt = Number.isFinite(parsedResetAt) ? parsedResetAt : resetAtMs;
  const remaining = Math.max(0, limit - count);
  const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));

  return {
    allowed: count <= limit,
    count,
    limit,
    remaining,
    resetAt,
    retryAfterSeconds,
  };
}
