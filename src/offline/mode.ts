const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const DEFAULT_DELAY_MIN_MS = 280;
const DEFAULT_DELAY_MAX_MS = 1100;
const MAX_DELAY_MS = 10_000;

function parseBooleanFlag(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value !== "string") {
    return false;
  }

  return TRUE_VALUES.has(value.trim().toLowerCase());
}

function envNumber(value: unknown): number | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isOfflineModeEnabled(env: NodeJS.ProcessEnv | undefined = process.env): boolean {
  if (!env) {
    return false;
  }

  return (
    parseBooleanFlag(env.BOARDROOM_OFFLINE_MODE) ||
    parseBooleanFlag(env.NEXT_PUBLIC_BOARDROOM_OFFLINE_MODE) ||
    parseBooleanFlag(env.npm_config_offline)
  );
}

export function withOfflineFallback(
  value: unknown,
  fallback: string,
  env: NodeJS.ProcessEnv | undefined = process.env,
): string {
  const primary = typeof value === "string" ? value.trim() : "";
  if (primary.length > 0) {
    return primary;
  }

  return isOfflineModeEnabled(env) ? fallback : "";
}

export function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function resolveOfflineDelayMs(seed: string, env: NodeJS.ProcessEnv | undefined = process.env): number {
  const minCandidate = envNumber(env?.BOARDROOM_OFFLINE_MIN_DELAY_MS);
  const maxCandidate = envNumber(env?.BOARDROOM_OFFLINE_MAX_DELAY_MS);

  const min = Math.max(0, Math.min(MAX_DELAY_MS, Math.round(minCandidate ?? DEFAULT_DELAY_MIN_MS)));
  const max = Math.max(min, Math.min(MAX_DELAY_MS, Math.round(maxCandidate ?? DEFAULT_DELAY_MAX_MS)));
  const span = Math.max(1, max - min + 1);

  return min + (hashString(seed) % span);
}

export async function sleepMs(delayMs: number): Promise<void> {
  if (delayMs <= 0) {
    return;
  }

  await new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}
