import { ConfiguredChairpersonAgent } from "../agents/base";
import { resolveModelForProvider } from "../config/llm_providers";
import { retrieveDecisionAncestryContext } from "../memory/retriever";
import type { ReviewOutput } from "../schemas/review_output";
import {
  getDecisionForWorkflow,
  recordWorkflowRun,
  updateDecisionStatus,
  upsertDecisionPrd,
  upsertDecisionReview,
  upsertDecisionSynthesis,
  upsertGovernanceChecks,
} from "../store/postgres";
import {
  CONFIDENCE_THRESHOLD,
  DQS_THRESHOLD,
  HYGIENE_THRESHOLD,
  STATUS_APPROVED,
  STATUS_BLOCKED,
  STATUS_CHALLENGED,
  STATUS_INCOMPLETE,
  STATUS_UNDER_EVALUATION,
} from "./constants";
import { deriveArtifactAssistantQuestions } from "./decision_workflow_assistant";
import { buildSynthesisEvidenceCitations } from "./decision_workflow_evidence";
import {
  average,
  hasLowSpecializedConfidence,
  specializedConfidenceValues,
} from "./decision_workflow_scoring";
import type { GateDecision, WorkflowDependencies } from "./decision_workflow_runtime";
import { evaluateRequiredGates, inferGovernanceChecksFromText } from "./gates";
import { evaluateHygiene } from "./hygiene";
import { buildPrdOutput } from "./prd";
import { runRiskSimulation } from "./risk_simulation";
import type { DecisionAncestryMatch, WorkflowState } from "./states";

export async function buildDecisionState(state: WorkflowState): Promise<WorkflowState> {
  const decision = await getDecisionForWorkflow(state.decision_id);
  if (!decision) {
    throw new Error(`Decision ${state.decision_id} was not found in PostgreSQL`);
  }

  const bodyText = decision.bodyText;
  const inferredChecks = inferGovernanceChecksFromText(bodyText);
  const autocheckedFields = Object.entries(inferredChecks)
    .filter(([gate, isMet]) => isMet && !decision.governanceChecks[gate])
    .map(([gate]) => gate);

  if (autocheckedFields.length > 0) {
    await upsertGovernanceChecks(state.decision_id, autocheckedFields);
  }

  const mergedChecks: Record<string, boolean> = { ...decision.governanceChecks };
  for (const gate of Object.keys(inferredChecks)) {
    mergedChecks[gate] = Boolean(mergedChecks[gate] || inferredChecks[gate]);
  }

  const properties: Record<string, unknown> = { ...decision.properties };
  for (const [gate, isChecked] of Object.entries(mergedChecks)) {
    properties[gate] = isChecked;
  }

  const missingSections = evaluateRequiredGates(properties, inferredChecks);
  const statusValue = missingSections.length === 0 ? STATUS_UNDER_EVALUATION : STATUS_INCOMPLETE;
  await updateDecisionStatus(state.decision_id, statusValue);

  const decisionName = decision.name.trim().length > 0 ? decision.name : `Untitled Decision ${state.decision_id}`;

  const decisionSnapshot = {
    page_id: decision.id,
    captured_at: decision.createdAt,
    properties,
    section_excerpt: [{ type: "text", text: { content: bodyText.slice(0, 12000) } }],
    computed: {
      inferred_governance_checks: inferredChecks,
      autochecked_governance_fields: autocheckedFields.sort(),
    },
  };

  const ancestryContext = await retrieveDecisionAncestryContext({
    decisionId: state.decision_id,
    decisionName,
    decisionSummary: typeof properties["Executive Summary"] === "string" ? properties["Executive Summary"] : "",
    bodyText,
    topK: 3,
  });

  const hygiene = evaluateHygiene(decisionSnapshot, missingSections);
  const riskSimulation = runRiskSimulation(decisionSnapshot, state.decision_id);

  const nextState: WorkflowState = {
    ...state,
    decision_snapshot: decisionSnapshot,
    status: "PROPOSED",
    missing_sections: missingSections,
    decision_name: decisionName,
    decision_ancestry: ancestryContext.similar_decisions as DecisionAncestryMatch[],
    decision_ancestry_retrieval_method: ancestryContext.retrieval_method,
    hygiene_score: hygiene.score,
    hygiene_findings: hygiene.findings,
    risk_simulation: riskSimulation,
  };

  return {
    ...nextState,
    artifact_assistant_questions: deriveArtifactAssistantQuestions(nextState),
  };
}

function normalizeRecommendation(value: string): "Approved" | "Challenged" | "Blocked" {
  const normalized = value.trim().toLowerCase();
  if (normalized === "approved") {
    return "Approved";
  }
  if (normalized === "blocked") {
    return "Blocked";
  }
  return "Challenged";
}

function applyChairpersonGuardrails(state: WorkflowState): WorkflowState {
  if (!state.synthesis) {
    return state;
  }

  const synthesis = { ...state.synthesis };
  const recommendation = normalizeRecommendation(synthesis.final_recommendation);
  const specialized = specializedConfidenceValues(state.reviews);
  const specializedConfidence = average(specialized);
  const evidenceCitations = buildSynthesisEvidenceCitations(state.reviews);
  const synthesisEvidenceCitations = Array.isArray(synthesis.evidence_citations)
    ? synthesis.evidence_citations.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
  const mergedEvidenceCitations = [...new Set([...synthesisEvidenceCitations, ...evidenceCitations])].slice(0, 8);
  const lastInteractionSummary = state.interaction_rounds.at(-1)?.summary?.trim() ?? "";

  const blockers = [...synthesis.blockers];
  const revisions = [...synthesis.required_revisions];
  let finalRecommendation = recommendation;

  const hardBlocked = ["cfo", "compliance"].some((agentId) => state.reviews[agentId]?.blocked);
  if (hardBlocked) {
    finalRecommendation = "Blocked";
    blockers.push("CFO or Compliance issued a hard block; governance policy enforces a blocked outcome.");
  }

  if (finalRecommendation === "Approved" && (state.hygiene_score ?? 0) < HYGIENE_THRESHOLD) {
    finalRecommendation = "Challenged";
    revisions.push("Raise hygiene score by resolving quantitative consistency and documentation gaps.");
  }

  if (finalRecommendation === "Approved" && hasLowSpecializedConfidence(state.reviews)) {
    finalRecommendation = "Challenged";
    revisions.push(
      `Specialized confidence is low (${Math.round(specializedConfidence * 100)}%). Add stronger evidence before approval.`,
    );
  }

  if (mergedEvidenceCitations.length > 0) {
    const hasEvidenceSection = synthesis.executive_summary.toLowerCase().includes("evidence citations:");
    if (!hasEvidenceSection) {
      synthesis.executive_summary = `${synthesis.executive_summary}\nEvidence citations:\n- ${mergedEvidenceCitations.join("\n- ")}`;
    }
  }

  if (!synthesis.point_of_contention.trim() && lastInteractionSummary.length > 0) {
    synthesis.point_of_contention = lastInteractionSummary;
  }

  if (finalRecommendation === "Approved" && (state.dissent_penalty ?? 0) >= 2.5) {
    finalRecommendation = "Challenged";
    revisions.push("Weighted dissent from risk/compliance reviewers requires additional mitigation evidence.");
  }

  if (state.evidence_verification?.verdict === "insufficient") {
    if (finalRecommendation === "Approved") {
      finalRecommendation = "Challenged";
    }
    revisions.push(...state.evidence_verification.required_actions.slice(0, 4));
  }

  return {
    ...state,
    chairperson_evidence_citations: mergedEvidenceCitations,
    synthesis: {
      ...synthesis,
      evidence_citations: mergedEvidenceCitations,
      final_recommendation: finalRecommendation,
      blockers: [...new Set(blockers)].slice(0, 6),
      required_revisions: [...new Set(revisions)].slice(0, 8),
    },
  };
}

export async function synthesizeReviews(state: WorkflowState, deps: WorkflowDependencies): Promise<WorkflowState> {
  const chairpersonModel = resolveModelForProvider(deps.defaultProvider, deps.modelName);
  const chairpersonAgent = new ConfiguredChairpersonAgent(
    deps.providerClients.getResilientClient(deps.defaultProvider),
    chairpersonModel,
    deps.temperature,
    500,
    {
      provider: deps.defaultProvider,
    },
  );
  const chairpersonSnapshot = {
    ...(state.decision_snapshot ?? {}),
    reviews: Object.values(state.reviews),
  };

  const synthesis = await chairpersonAgent.evaluate({
    snapshot: chairpersonSnapshot,
    memory_context: {
      decision_ancestry: state.decision_ancestry ?? [],
      hygiene_score: state.hygiene_score ?? 0,
      hygiene_findings: state.hygiene_findings ?? [],
      confidence_score: state.confidence_score ?? 0,
      dissent_penalty: state.dissent_penalty ?? 0,
      confidence_penalty: state.confidence_penalty ?? 0,
      review_evidence_lines: buildSynthesisEvidenceCitations(state.reviews),
      weighted_conflict_signal: {
        dissent_penalty: state.dissent_penalty ?? 0,
        confidence_penalty: state.confidence_penalty ?? 0,
        risk_dissent_overhang: (state.dissent_penalty ?? 0) >= 2.5,
      },
      market_intelligence: state.market_intelligence ?? null,
      evidence_verification: state.evidence_verification ?? null,
      risk_simulation: state.risk_simulation ?? null,
      artifact_assistant_questions: state.artifact_assistant_questions ?? [],
    },
  });

  const next: WorkflowState = {
    ...state,
    synthesis,
    status: "SYNTHESIZED",
  };

  return applyChairpersonGuardrails(next);
}

export async function decideGate(state: WorkflowState): Promise<GateDecision> {
  const anyBlocked = Object.values(state.reviews).some((review) => review.blocked);

  if (anyBlocked) {
    await updateDecisionStatus(state.decision_id, STATUS_BLOCKED);
    return "blocked";
  }

  if ((state.hygiene_score ?? 0) < HYGIENE_THRESHOLD) {
    await updateDecisionStatus(state.decision_id, STATUS_CHALLENGED);
    return "revision_required";
  }

  if ((state.confidence_score ?? 0) < CONFIDENCE_THRESHOLD || hasLowSpecializedConfidence(state.reviews)) {
    await updateDecisionStatus(state.decision_id, STATUS_CHALLENGED);
    return "revision_required";
  }

  if ((state.dissent_penalty ?? 0) >= 2.5) {
    await updateDecisionStatus(state.decision_id, STATUS_CHALLENGED);
    return "revision_required";
  }

  if (state.evidence_verification?.verdict === "insufficient") {
    await updateDecisionStatus(state.decision_id, STATUS_CHALLENGED);
    return "revision_required";
  }

  if (state.dqs < DQS_THRESHOLD) {
    await updateDecisionStatus(state.decision_id, STATUS_CHALLENGED);
    return "revision_required";
  }

  await updateDecisionStatus(state.decision_id, STATUS_APPROVED);
  return "approved";
}

export function generatePrd(state: WorkflowState): WorkflowState {
  return {
    ...state,
    prd: buildPrdOutput(state),
    status: "DECIDED",
  };
}

export async function persistArtifacts(state: WorkflowState, gateDecision: GateDecision): Promise<WorkflowState> {
  for (const [agentName, reviewOutput] of Object.entries(state.reviews)) {
    await upsertDecisionReview(state.decision_id, agentName, reviewOutput);
  }

  if (state.synthesis) {
    await upsertDecisionSynthesis(state.decision_id, state.synthesis);

    const chairpersonReview: ReviewOutput = {
      agent: "Chairperson",
      thesis: state.synthesis.executive_summary,
      score: Math.max(1, Math.min(10, Math.round(state.dqs))),
      confidence: 1,
      blocked: state.synthesis.final_recommendation === STATUS_BLOCKED,
      blockers: state.synthesis.blockers,
      risks: [],
      citations: state.chairperson_evidence_citations?.map((entry) => ({
        url: entry.replace(/^\[[^\]]+\]\s*/, ""),
        title: "Chairperson Evidence Line",
        claim: entry,
      })) ?? [],
      required_changes: state.synthesis.required_revisions,
      approval_conditions: [],
      apga_impact_view: "N/A",
      governance_checks_met: {},
    };

    await upsertDecisionReview(state.decision_id, "Chairperson", chairpersonReview);
  }

  if (state.status === "DECIDED" && state.prd) {
    await upsertDecisionPrd(state.decision_id, state.prd);
  }

  await recordWorkflowRun(
    state.decision_id,
    state.dqs,
    gateDecision,
    state.status,
    state as unknown as Record<string, unknown>,
  );

  return {
    ...state,
    status: "PERSISTED",
  };
}
