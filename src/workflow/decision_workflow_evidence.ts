import type { ReviewOutput } from "../schemas/review_output";
import type { WorkflowDependencies } from "./decision_workflow_runtime";
import { deriveArtifactAssistantQuestions } from "./decision_workflow_assistant";
import { isRiskWeightedAgent } from "./decision_workflow_scoring";
import type {
  WorkflowEvidenceVerification,
  WorkflowEvidenceVerificationAgentResult,
  WorkflowState,
  WorkflowTraceEvent,
} from "./states";

function uniqueCitationUrls(review: ReviewOutput): string[] {
  const deduped = new Set<string>();
  for (const citation of review.citations ?? []) {
    if (typeof citation?.url !== "string") {
      continue;
    }

    const normalized = citation.url.trim();
    if (!normalized) {
      continue;
    }

    deduped.add(normalized);
  }

  return [...deduped];
}

function summarizeEvidenceGap(agentName: string, gap: string): string {
  return `[${agentName}] ${gap}`;
}

function truncateForTrace(value: string, maxLength = 320): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function extractProviderFailureDetails(review: ReviewOutput): string | null {
  const candidates = [
    ...(Array.isArray(review.blockers) ? review.blockers : []),
    ...(Array.isArray(review.risks) ? review.risks.map((risk) => risk?.evidence ?? "") : []),
  ]
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);

  for (const candidate of candidates) {
    const attemptsMatch = candidate.match(/All providers failed\.\s*Attempts:\s*([\s\S]+)/i);
    if (attemptsMatch?.[1]) {
      return truncateForTrace(attemptsMatch[1].trim());
    }

    if (/provider/i.test(candidate) && /fail|error|rate limit|missing/i.test(candidate)) {
      return truncateForTrace(candidate);
    }
  }

  return null;
}

export function emitProviderFailureTrace(
  deps: WorkflowDependencies,
  agentId: string,
  agentName: string,
  review: ReviewOutput,
): void {
  const details = extractProviderFailureDetails(review);
  if (!details || !deps.onTrace) {
    return;
  }

  const event: WorkflowTraceEvent = {
    tag: "WARN",
    agentId,
    message: `${agentName} provider failure: ${details}`,
  };
  deps.onTrace(event);
}

function verifySingleReviewEvidence(
  agentId: string,
  review: ReviewOutput,
  deps: WorkflowDependencies,
): WorkflowEvidenceVerificationAgentResult {
  const gaps: string[] = [];
  const thesisLength = review.thesis.trim().length;
  const riskEvidenceCount = review.risks.filter((risk) => risk.evidence.trim().length >= 12).length;
  const citationCount = uniqueCitationUrls(review).length;

  if (thesisLength < 24) {
    gaps.push("Thesis is too short to be auditable.");
  }

  if (review.risks.length > 0 && riskEvidenceCount === 0) {
    gaps.push("Risks were listed without concrete evidence details.");
  }

  if (review.blocked && review.blockers.length === 0) {
    gaps.push("Review is blocked but no explicit blocker was provided.");
  }

  const requireCitation =
    deps.includeExternalResearch ||
    review.risks.length > 0 ||
    review.blocked ||
    (isRiskWeightedAgent(agentId) && review.required_changes.length > 0);

  if (requireCitation && citationCount === 0) {
    gaps.push("No supporting citations were provided for material claims.");
  }

  return {
    agent_id: agentId,
    agent_name: review.agent,
    verdict: gaps.length > 0 ? "insufficient" : "sufficient",
    citation_count: citationCount,
    risk_evidence_count: riskEvidenceCount,
    gaps,
  };
}

export function buildSynthesisEvidenceCitations(reviews: Record<string, ReviewOutput>): string[] {
  const citations: string[] = [];
  const sorted = Object.values(reviews).sort((left, right) => {
    if (left.blocked !== right.blocked) {
      return left.blocked ? -1 : 1;
    }
    return left.score - right.score;
  });

  for (const review of sorted) {
    citations.push(`[${review.agent}:thesis] ${review.thesis}`);
    if (review.blockers[0]) {
      citations.push(`[${review.agent}:blocker] ${review.blockers[0]}`);
    }
    if (review.required_changes[0]) {
      citations.push(`[${review.agent}:revision] ${review.required_changes[0]}`);
    }
    if (review.citations[0]?.url) {
      citations.push(`[${review.agent}:source] ${review.citations[0].url}`);
    }
    if (citations.length >= 8) {
      break;
    }
  }

  return citations.slice(0, 8);
}

export function runEvidenceVerification(state: WorkflowState, deps: WorkflowDependencies): WorkflowState {
  const byAgent: WorkflowEvidenceVerificationAgentResult[] = [];

  for (const config of deps.agentConfigs) {
    const review = state.reviews[config.id];
    if (!review) {
      continue;
    }

    byAgent.push(verifySingleReviewEvidence(config.id, review, deps));
  }

  const insufficient = byAgent.filter((entry) => entry.verdict === "insufficient");
  const requiredActions = insufficient
    .flatMap((entry) => entry.gaps.map((gap) => summarizeEvidenceGap(entry.agent_name || entry.agent_id, gap)))
    .slice(0, 8);

  const verification: WorkflowEvidenceVerification = {
    generated_at: new Date().toISOString(),
    verdict: insufficient.length === 0 ? "sufficient" : "insufficient",
    summary:
      insufficient.length === 0
        ? "Evidence verification passed for all executive reviews."
        : `${insufficient.length} review(s) require stronger evidence before synthesis can be trusted.`,
    required_actions: requiredActions,
    by_agent: byAgent,
  };

  const nextState: WorkflowState = {
    ...state,
    evidence_verification: verification,
  };

  return {
    ...nextState,
    artifact_assistant_questions: deriveArtifactAssistantQuestions(nextState),
  };
}
