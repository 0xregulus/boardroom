const LABEL_ONLY_PHRASES = new Set([
  "",
  "+",
  "-",
  "objective supported",
  "kpi impact",
  "cost of inaction",
  "clear problem statement",
  "root cause",
  "affected segment",
  "quantified impact",
  "chosen option",
  "trade-offs",
  "trade offs",
  "primary metric",
  "leading indicators",
  "review cadence",
  "criteria",
  "revenue impact (12m)",
  "cost impact",
  "margin effect",
  "payback period",
  "confidence level",
  "risk",
  "impact",
  "probability",
  "mitigation",
  "we will stop or pivot if",
]);

const LINE_PREFIXES_TO_STRIP = [
  "decision requirement:",
  "executive requirement:",
  "problem framing:",
  "options evaluated:",
  "financial model:",
  "kill criterion:",
  "decision memo:",
];

function lcsLength(a: string, b: string): number {
  const dp: number[] = new Array(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i += 1) {
    let prev = 0;
    for (let j = 1; j <= b.length; j += 1) {
      const temp = dp[j];
      if (a[i - 1] === b[j - 1]) {
        dp[j] = prev + 1;
      } else {
        dp[j] = Math.max(dp[j], dp[j - 1]);
      }
      prev = temp;
    }
  }

  return dp[b.length] ?? 0;
}

function similarityRatio(a: string, b: string): number {
  if (!a && !b) {
    return 1;
  }

  const denominator = a.length + b.length;
  if (denominator === 0) {
    return 0;
  }

  return (2 * lcsLength(a, b)) / denominator;
}

export function cleanLine(text: string, maxLen = 260): string {
  let normalized = text.replaceAll("**", "").replaceAll("`", "");
  normalized = normalized.replaceAll("\t", " ").split(/\s+/).join(" ").trim();
  normalized = normalized.replace(/^[\s\-•]+|[\s\-•]+$/g, "");

  let lowered = normalized.toLowerCase();
  for (const prefix of LINE_PREFIXES_TO_STRIP) {
    if (lowered.startsWith(prefix)) {
      normalized = normalized.slice(prefix.length).trim();
      lowered = normalized.toLowerCase();
      break;
    }
  }

  const trimmed = normalized.slice(0, maxLen).trim();
  const lowerTrimmed = trimmed.toLowerCase().replace(/:$/, "");

  if (["", "+", "|", "-", "chosen option", "trade-offs", "trade offs"].includes(lowerTrimmed)) {
    return "";
  }

  return trimmed;
}

export function isLabelOnlyLine(line: string): boolean {
  const normalized = cleanLine(line, 260).toLowerCase().trim();

  if (!normalized) {
    return true;
  }
  if (LABEL_ONLY_PHRASES.has(normalized)) {
    return true;
  }
  if (normalized.startsWith("option ")) {
    return true;
  }

  if (normalized.includes(":")) {
    const tail = normalized.split(":").at(-1)?.trim() ?? "";
    if (!tail || LABEL_ONLY_PHRASES.has(tail) || tail.startsWith("option ")) {
      return true;
    }
    if (/^option\s+[a-z0-9]+(?:\s*\(.+\))?$/.test(tail)) {
      return true;
    }
  }

  if (normalized.endsWith(":")) {
    const core = normalized.slice(0, -1).trim();
    if (!core) {
      return true;
    }
    if (LABEL_ONLY_PHRASES.has(core)) {
      return true;
    }
    if (core.split(/\s+/).length <= 4) {
      return true;
    }
  }

  return false;
}

export function dedupeKeepOrder(lines: string[], limit = 8): string[] {
  const output: string[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const cleaned = cleanLine(line);
    if (!cleaned) {
      continue;
    }

    const key = cleaned.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(cleaned);

    if (output.length >= limit) {
      break;
    }
  }

  return output;
}

export function normalizeSimilarityText(text: string): string {
  let normalized = text.toLowerCase();
  normalized = normalized.replace(/[^a-z0-9\s]/g, " ");
  normalized = normalized.replace(
    /\b(a|an|the|to|for|of|and|or|with|all|ensure|perform|conduct|develop|comprehensive|thorough|potential|required)\b/g,
    " ",
  );
  normalized = normalized.replace(/\s+/g, " ").trim();
  return normalized;
}

export function dedupeSemantic(lines: string[], limit = 8, similarity = 0.86): string[] {
  const output: string[] = [];
  const normalizedOutput: string[] = [];

  for (const line of lines) {
    const cleaned = cleanLine(line);
    if (!cleaned) {
      continue;
    }

    let normalized = normalizeSimilarityText(cleaned);
    if (!normalized) {
      normalized = cleaned.toLowerCase();
    }

    let duplicate = false;
    for (const prior of normalizedOutput) {
      if (normalized === prior || similarityRatio(normalized, prior) >= similarity) {
        duplicate = true;
        break;
      }
    }

    if (duplicate) {
      continue;
    }

    output.push(cleaned);
    normalizedOutput.push(normalized);

    if (output.length >= limit) {
      break;
    }
  }

  return output;
}
