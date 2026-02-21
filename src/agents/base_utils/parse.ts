function extractBalancedJsonObject(content: string): string | null {
  const start = content.indexOf("{");
  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < content.length; i += 1) {
    const ch = content[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{") {
      depth += 1;
      continue;
    }

    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return content.slice(start, i + 1);
      }
    }
  }

  return null;
}

function parseJsonCandidate(candidate: string): unknown | null {
  const trimmed = candidate.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const attempts = [trimmed];
  const pythonish = trimmed
    .replace(/\bTrue\b/g, "true")
    .replace(/\bFalse\b/g, "false")
    .replace(/\bNone\b/g, "null")
    .replace(/([{,]\s*)'([^'\\]*(?:\\.[^'\\]*)*)'\s*:/g, '$1"$2":')
    .replace(/:\s*'([^'\\]*(?:\\.[^'\\]*)*)'/g, ': "$1"')
    .replace(/,\s*([}\]])/g, "$1");
  attempts.push(pythonish);

  for (const entry of attempts) {
    try {
      return JSON.parse(entry);
    } catch {
      // Keep trying other parse candidates.
    }
  }

  return null;
}

export function safeJsonParse(content: string): unknown | null {
  const candidates: string[] = [];
  const trimmed = content.trim();

  if (trimmed.length === 0) {
    return null;
  }

  candidates.push(trimmed);

  const fenced = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  for (const match of fenced) {
    const block = match[1]?.trim();
    if (block) {
      candidates.push(block);
    }
  }

  const balanced = extractBalancedJsonObject(trimmed);
  if (balanced) {
    candidates.push(balanced);
  }

  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);

    const parsed = parseJsonCandidate(candidate);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}
