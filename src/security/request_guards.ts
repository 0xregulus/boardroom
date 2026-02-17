import { timingSafeEqual } from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";

import { checkRateLimitBucket } from "../store/postgres";

interface RateLimitOptions {
  routeKey: string;
  limit: number;
  windowMs: number;
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

type RateLimitBackend = "memory" | "postgres";

const rateLimitStore = new Map<string, RateLimitBucket>();
let rateLimitFallbackWarningLogged = false;

function firstHeaderValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0]?.trim() || null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  return null;
}

function normalizeIp(value: string): string {
  if (value.startsWith("::ffff:")) {
    return value.slice("::ffff:".length);
  }
  return value;
}

function socketIp(req: NextApiRequest): string {
  const fromSocket =
    req.socket?.remoteAddress ??
    (req as unknown as { connection?: { remoteAddress?: string } }).connection?.remoteAddress ??
    "unknown";

  return normalizeIp(fromSocket);
}

function shouldTrustProxyHeaders(): boolean {
  return (process.env.BOARDROOM_TRUST_PROXY ?? "").trim().toLowerCase() === "true";
}

function clientIp(req: NextApiRequest): string {
  const directSocketIp = socketIp(req);
  if (!shouldTrustProxyHeaders()) {
    return directSocketIp;
  }

  const forwardedFor = firstHeaderValue(req.headers["x-forwarded-for"]);
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first && first.length > 0) {
      return normalizeIp(first);
    }
  }

  const realIp = firstHeaderValue(req.headers["x-real-ip"]);
  if (realIp) {
    return normalizeIp(realIp);
  }

  return directSocketIp;
}

function isLoopbackIp(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1" || ip === "localhost";
}

function secureEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeLimit(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.max(1, Math.min(10_000, Math.round(value)));
}

function normalizeWindowMs(value: number): number {
  if (!Number.isFinite(value)) {
    return 60_000;
  }

  return Math.max(1_000, Math.min(24 * 60 * 60 * 1_000, Math.round(value)));
}

function configuredRateLimitBackend(): RateLimitBackend {
  const configured = (process.env.BOARDROOM_RATE_LIMIT_BACKEND ?? "").trim().toLowerCase();
  if (configured === "memory") {
    return "memory";
  }

  if (configured === "postgres") {
    return "postgres";
  }

  return (process.env.POSTGRES_URL ?? "").trim().length > 0 ? "postgres" : "memory";
}

function checkMemoryRateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const limit = normalizeLimit(options.limit);
  const windowMs = normalizeWindowMs(options.windowMs);
  const now = Date.now();
  const existing = rateLimitStore.get(key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    rateLimitStore.set(key, {
      count: 1,
      resetAt,
    });

    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - 1),
      resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
  return {
    allowed: existing.count <= limit,
    limit,
    remaining: Math.max(0, limit - existing.count),
    resetAt: existing.resetAt,
    retryAfterSeconds,
  };
}

function writeRateLimitHeaders(res: NextApiResponse, result: RateLimitResult): void {
  res.setHeader("X-RateLimit-Limit", String(result.limit));
  res.setHeader("X-RateLimit-Remaining", String(Math.max(0, result.remaining)));
  res.setHeader("X-RateLimit-Reset", String(result.resetAt));
}

export async function enforceRateLimit(
  req: NextApiRequest,
  res: NextApiResponse,
  options: RateLimitOptions,
): Promise<boolean> {
  if (process.env.NODE_ENV === "test") {
    return true;
  }

  const ip = clientIp(req);
  const key = `${options.routeKey}:${ip}`;
  let result: RateLimitResult;

  if (configuredRateLimitBackend() === "postgres") {
    try {
      const dbResult = await checkRateLimitBucket({
        bucketKey: key,
        limit: options.limit,
        windowMs: options.windowMs,
      });

      result = {
        allowed: dbResult.allowed,
        limit: dbResult.limit,
        remaining: dbResult.remaining,
        resetAt: dbResult.resetAt,
        retryAfterSeconds: dbResult.retryAfterSeconds,
      };
    } catch (error) {
      if (!rateLimitFallbackWarningLogged) {
        console.warn("[security] PostgreSQL rate limiting unavailable, falling back to memory buckets", error);
        rateLimitFallbackWarningLogged = true;
      }
      result = checkMemoryRateLimit(key, options);
    }
  } else {
    result = checkMemoryRateLimit(key, options);
  }

  writeRateLimitHeaders(res, result);
  if (result.allowed) {
    return true;
  }

  res.setHeader("Retry-After", String(result.retryAfterSeconds));
  res.status(429).json({ error: "Too many requests" });
  return false;
}

export function enforceSensitiveRouteAccess(req: NextApiRequest, res: NextApiResponse): boolean {
  if (process.env.NODE_ENV === "test") {
    return true;
  }

  const ip = clientIp(req);
  if (isLoopbackIp(ip)) {
    return true;
  }

  const expectedAdminKey = (process.env.BOARDROOM_ADMIN_KEY ?? "").trim();
  if (expectedAdminKey.length === 0) {
    res.status(503).json({
      error: "Sensitive route access is disabled until BOARDROOM_ADMIN_KEY is configured",
    });
    return false;
  }

  const providedAdminKey = firstHeaderValue(req.headers["x-boardroom-admin-key"]);
  if (!providedAdminKey || !secureEquals(providedAdminKey, expectedAdminKey)) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }

  return true;
}
