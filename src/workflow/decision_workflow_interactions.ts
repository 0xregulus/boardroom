import type { AgentConfig } from "../config/agent_config";
import type { ReviewOutput } from "../schemas/review_output";
import type { AgentInteractionDelta } from "./states";

interface PeerReviewContext {
  agent_id: string;
  agent: string;
  score: number;
  blocked: boolean;
  thesis: string;
  blockers: string[];
  risks: Array<{ type: string; severity: number; evidence: string }>;
  required_changes: string[];
}

export function buildPeerReviewContext(reviews: Record<string, ReviewOutput>, currentAgentId: string): PeerReviewContext[] {
  const peers: PeerReviewContext[] = [];

  for (const [agentId, review] of Object.entries(reviews)) {
    if (agentId === currentAgentId) {
      continue;
    }

    peers.push({
      agent_id: agentId,
      agent: review.agent,
      score: review.score,
      blocked: review.blocked,
      thesis: review.thesis,
      blockers: review.blockers.slice(0, 3),
      risks: review.risks.slice(0, 3),
      required_changes: review.required_changes.slice(0, 3),
    });
  }

  return peers;
}

export function buildInteractionDeltas(
  previousReviews: Record<string, ReviewOutput>,
  revisedReviews: Record<string, ReviewOutput>,
  agentConfigs: AgentConfig[],
): AgentInteractionDelta[] {
  const deltas: AgentInteractionDelta[] = [];

  for (const config of agentConfigs) {
    const previous = previousReviews[config.id];
    const revised = revisedReviews[config.id];
    if (!previous || !revised) {
      continue;
    }

    const scoreDelta = revised.score - previous.score;
    const blockedChanged = revised.blocked !== previous.blocked;
    const changed = scoreDelta !== 0 || blockedChanged;

    if (!changed) {
      continue;
    }

    deltas.push({
      agent_id: config.id,
      agent_name: revised.agent || config.name,
      previous_score: previous.score,
      revised_score: revised.score,
      score_delta: scoreDelta,
      previous_blocked: previous.blocked,
      revised_blocked: revised.blocked,
    });
  }

  return deltas;
}

export function summarizeInteractionRound(round: number, deltas: AgentInteractionDelta[]): string {
  if (deltas.length === 0) {
    return `Round ${round}: no review score or block-status changes.`;
  }

  const scoreChanges = deltas.filter((delta) => delta.score_delta !== 0).length;
  const blockStatusChanges = deltas.filter((delta) => delta.previous_blocked !== delta.revised_blocked).length;
  const newBlocks = deltas.filter((delta) => !delta.previous_blocked && delta.revised_blocked).length;

  return `Round ${round}: ${scoreChanges} score changes, ${blockStatusChanges} block-status changes, ${newBlocks} new blocks.`;
}
