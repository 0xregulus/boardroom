const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /(?<!\d)(?:\+?\d[\d\s().-]{7,}\d)(?!\d)/g;
const OPENAI_KEY_PATTERN = /\bsk-[A-Za-z0-9_-]{16,}\b/g;
const TAVILY_KEY_PATTERN = /\btvly-[A-Za-z0-9_-]{8,}\b/g;
const SECRET_LIKE_PATTERN = /\b(?:api[_-]?key|token|secret|password|passwd|pwd|ssn)\b/i;

const MAX_RECURSION_DEPTH = 8;
const MAX_STRING_LENGTH = 2_000;

function truncate(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_STRING_LENGTH)}...`;
}

export function redactSensitiveString(value: string): string {
  return truncate(value)
    .replace(EMAIL_PATTERN, "[REDACTED_EMAIL]")
    .replace(PHONE_PATTERN, "[REDACTED_PHONE]")
    .replace(OPENAI_KEY_PATTERN, "[REDACTED_API_KEY]")
    .replace(TAVILY_KEY_PATTERN, "[REDACTED_API_KEY]");
}

function shouldRedactByKey(key: string): boolean {
  return SECRET_LIKE_PATTERN.test(key);
}

function sanitizeInner(value: unknown, depth: number): unknown {
  if (depth > MAX_RECURSION_DEPTH) {
    return "[REDACTED_DEPTH_LIMIT]";
  }

  if (typeof value === "string") {
    return redactSensitiveString(value);
  }

  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeInner(entry, depth + 1));
  }

  if (typeof value !== "object") {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (shouldRedactByKey(key)) {
      result[key] = "[REDACTED]";
      continue;
    }

    result[key] = sanitizeInner(entry, depth + 1);
  }

  return result;
}

export function sanitizeForExternalUse(value: unknown): unknown {
  return sanitizeInner(value, 0);
}
