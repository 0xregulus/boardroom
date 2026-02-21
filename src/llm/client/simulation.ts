import type { LLMProvider } from "../../config/llm_providers";
import { hashString, resolveSimulationDelayMs, sleepMs } from "../../simulation/mode";
import type { LLMCompletionRequest } from "./types";

const SIMULATED_GOVERNANCE_CHECKS = {
  "≥3 Options Evaluated": true,
  "Success Metrics Defined": true,
  "Leading Indicators Defined": true,
  "Kill Criteria Defined": true,
  "Option Trade-offs Explicit": true,
  "Risk Matrix Completed": true,
  "Financial Model Included": true,
  "Downside Modeled": true,
  "Compliance Reviewed": true,
  "Decision Memo Written": true,
  "Root Cause Done": true,
  "Assumptions Logged": true,
};

function isChairpersonPrompt(request: LLMCompletionRequest): boolean {
  const haystack = `${request.systemMessage}\n${request.userMessage}`.toLowerCase();
  return haystack.includes("chairperson") || haystack.includes("final_recommendation") || haystack.includes("consensus_points");
}

function extractAgentName(request: LLMCompletionRequest): string {
  const fromSchema = request.userMessage.match(/"agent"\s*:\s*"([^"]+)"/i)?.[1]?.trim();
  if (fromSchema && fromSchema.length > 0) {
    return fromSchema;
  }

  const fromRoleLine = request.userMessage.match(/agent_name["\s:]+([A-Za-z0-9' -]{2,})/i)?.[1]?.trim();
  if (fromRoleLine && fromRoleLine.length > 0) {
    return fromRoleLine;
  }

  return "Simulation Agent";
}

function simulatedReviewResponse(provider: LLMProvider, request: LLMCompletionRequest): string {
  const agent = extractAgentName(request);
  const seed = hashString(`${provider}:${request.model}:${agent}:${request.userMessage.slice(0, 220)}`);
  const score = 6 + (seed % 4);
  const confidence = Math.min(0.94, 0.62 + ((seed % 28) / 100));
  const blocked = /compliance|risk|devil|pre-mortem/i.test(agent) && seed % 9 === 0;

  return JSON.stringify({
    agent,
    thesis: `${agent} simulated review: evidence suggests a viable path with measurable downside controls.`,
    score,
    confidence: Number(confidence.toFixed(2)),
    blocked,
    blockers: blocked ? [`${agent} requires stronger controls before approval.`] : [],
    risks: [
      {
        type: "execution_risk",
        severity: 4 + (seed % 5),
        evidence: `${agent} flagged concentrated implementation dependency.`,
      },
    ],
    citations: [
      {
        url: `https://simulation.local/${provider.toLowerCase()}/${agent.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        title: "Simulated source",
        claim: "Synthetic evidence generated for local development mode.",
      },
    ],
    required_changes: blocked ? ["Define explicit stop-loss and rollback criteria."] : ["Confirm telemetry before rollout."],
    approval_conditions: blocked ? [] : ["Proceed with staged rollout and weekly checkpoints."],
    apga_impact_view: "Simulation indicates moderate upside with controllable downside exposure.",
    governance_checks_met: SIMULATED_GOVERNANCE_CHECKS,
  });
}

function simulatedChairpersonResponse(provider: LLMProvider, request: LLMCompletionRequest): string {
  const seed = hashString(`${provider}:${request.model}:${request.userMessage.slice(0, 260)}`);
  const finalRecommendation = seed % 5 === 0 ? "Blocked" : seed % 3 === 0 ? "Challenged" : "Approved";

  return JSON.stringify({
    executive_summary: "Simulation mode generated a synthetic board synthesis for local UX validation.",
    final_recommendation: finalRecommendation,
    consensus_points: [
      "Core strategic thesis is coherent under baseline assumptions.",
      "Risk controls are present but require continuous monitoring.",
    ],
    point_of_contention: "Downside execution variance remains the primary debate point.",
    residual_risks: ["Synthetic output is not production-grade evidence."],
    evidence_citations: ["[SIM] Deterministic evidence set"],
    conflicts: finalRecommendation === "Approved" ? [] : ["Risk-focused reviewer challenged rollout timing."],
    blockers: finalRecommendation === "Blocked" ? ["Add hard stop-loss triggers before release."] : [],
    required_revisions: finalRecommendation === "Approved" ? [] : ["Tighten governance gates and owner accountability."],
  });
}

export async function simulateCompletion(provider: LLMProvider, request: LLMCompletionRequest): Promise<string> {
  const delayMs = resolveSimulationDelayMs(`${provider}:${request.model}:${request.userMessage.slice(0, 180)}`);
  await sleepMs(delayMs);

  if (!request.requireJsonObject) {
    return `[SIMULATED:${provider}] ${request.model} response for local UX testing.`;
  }

  return isChairpersonPrompt(request)
    ? simulatedChairpersonResponse(provider, request)
    : simulatedReviewResponse(provider, request);
}
