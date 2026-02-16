import { timingSafeEqual } from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";

interface RateLimitOptions {
  routeKey: string;
  limit: number;
  windowMs: number;
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitBucket>();

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

export function enforceRateLimit(req: NextApiRequest, res: NextApiResponse, options: RateLimitOptions): boolean {
  if (process.env.NODE_ENV === "test") {
    return true;
  }

  const ip = clientIp(req);
  const key = `${options.routeKey}:${ip}`;
  const now = Date.now();
  const existing = rateLimitStore.get(key);

  if (!existing || existing.resetAt <= now) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + options.windowMs,
    });
    return true;
  }

  existing.count += 1;
  if (existing.count <= options.limit) {
    return true;
  }

  const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
  res.setHeader("Retry-After", String(retryAfterSeconds));
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
