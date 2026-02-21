import type { ReviewOutput } from "../../schemas/review_output";
import { cleanLine, dedupeKeepOrder, dedupeSemantic } from "./text";
import { sectionLines } from "./snapshot";

function requirementTopicKey(text: string): string {
  const lowered = text.toLowerCase();
  if (lowered.includes("downside model") || lowered.includes("downside modeling")) {
    return "downside_modeling";
  }
  if (lowered.includes("compliance review")) {
    return "compliance_review";
  }
  if (lowered.includes("risk matrix")) {
    return "risk_matrix";
  }
  return "";
}

export function reviewsRequiredChanges(reviews: Record<string, ReviewOutput>, limit = 6): string[] {
  const lines: string[] = [];
  const seenTopics = new Set<string>();

  for (const review of Object.values(reviews)) {
    for (const change of review.required_changes) {
      const cleaned = cleanLine(change);
      if (!cleaned) {
        continue;
      }

      const topicKey = requirementTopicKey(cleaned);
      if (topicKey && seenTopics.has(topicKey)) {
        continue;
      }
      if (topicKey) {
        seenTopics.add(topicKey);
      }

      lines.push(cleaned);
    }
  }

  return dedupeSemantic(lines, limit);
}

export function reviewsRiskEvidence(reviews: Record<string, ReviewOutput>, limit = 6): string[] {
  const lines: string[] = [];

  for (const review of Object.values(reviews)) {
    for (const risk of review.risks) {
      lines.push(`${risk.type}: ${risk.evidence}`);
    }
  }

  return dedupeKeepOrder(lines, limit);
}

export function finalDecisionRequirements(finalDecisionText: string): string[] {
  if (!finalDecisionText) {
    return [];
  }

  const cleanText = finalDecisionText.replaceAll("**", "");
  const requirements: string[] = [];

  const optionMatches = [...cleanText.matchAll(/Option\s+([A-Za-z0-9]+)\s*\(([^)]+)\)/g)];

  if (optionMatches.length > 0) {
    const optionDescriptions = dedupeKeepOrder(
      optionMatches.map((match) => `Option ${match[1]} (${match[2].trim()})`),
      4,
    );

    if (optionDescriptions.length === 1) {
      requirements.push(`Implement ${optionDescriptions[0]} as the selected approach.`);
    } else {
      const joined = optionDescriptions.slice(0, 3).join(" + ");
      requirements.push(`Implement a phased rollout combining ${joined}.`);
    }
  }

  for (const line of sectionLines(cleanText, 12)) {
    const lowerLine = line.toLowerCase().replace(/:$/, "");

    if (["chosen option", "trade-offs", "trade offs", "combine", "+"].includes(lowerLine)) {
      continue;
    }

    if (line.toLowerCase().startsWith("option ")) {
      continue;
    }

    if (optionMatches.length > 0 && lowerLine.includes("combine option")) {
      continue;
    }

    if (lowerLine.includes("trade-off") || lowerLine.includes("trade off")) {
      continue;
    }

    if (line.startsWith("Prioritize ") || line.startsWith("Focus ")) {
      requirements.push(`Trade-off guardrail: ${line.replace(/[.]$/, "")}.`);
    } else if (lowerLine.includes("phased rollout") && lowerLine.includes("option")) {
      requirements.push(line.replace(/[.]$/, ""));
    }
  }

  return dedupeSemantic(requirements, 5, 0.8);
}
