import { resolveModelForProvider } from "../config/llm_providers";
import {
  AgentContext,
  ConfiguredChairpersonAgent,
  ConfiguredComplianceAgent,
  ConfiguredReviewAgent,
} from "../agents/base";
import { reviewOutputSchema, ReviewOutput } from "../schemas/review_output";
import {
  getDecisionForWorkflow,
  listProposedDecisionIds,
  recordWorkflowRun,
  updateDecisionStatus,
  upsertDecisionPrd,
  upsertDecisionReview,
  upsertDecisionSynthesis,
  upsertGovernanceChecks,
} from "../store/postgres";
import { retrieveDecisionAncestryContext } from "../memory/retriever";
import { evaluateRequiredGates, GOVERNANCE_CHECKBOX_FIELDS, inferGovernanceChecksFromText } from "./gates";
import { evaluateHygiene } from "./hygiene";
import { buildPrdOutput } from "./prd";
import {
  AgentInteractionRound,
  DecisionAncestryMatch,
  RunWorkflowOptions,
  WorkflowEvidenceVerification,
  WorkflowEvidenceVerificationAgentResult,
  WorkflowMarketIntelligenceSignal,
  WorkflowState,
} from "./states";
import { fetchTavilyResearch } from "../research/tavily";
import {
  buildDependencies,
  createReviewAgent,
  type GateDecision,
  initialState,
  maxBulkRunDecisions,
  resolveRuntimeConfig,
  type WorkflowDependencies,
} from "./decision_workflow_runtime";
import {
  CORE_DQS_WEIGHTS,
  CONFIDENCE_THRESHOLD,
  EXTRA_AGENT_WEIGHT,
  DQS_THRESHOLD,
  HYGIENE_THRESHOLD,
  HYGIENE_WEIGHT,
  SUBSTANCE_WEIGHT,
  STATUS_APPROVED,
  STATUS_BLOCKED,
  STATUS_CHALLENGED,
  STATUS_INCOMPLETE,
  STATUS_UNDER_EVALUATION
} from "./constants";
import {
  buildInteractionDeltas,
  buildPeerReviewContext,
  summarizeInteractionRound,
} from "./decision_workflow_interactions";

function invalidReviewFallback(agentName: string, reason: string): ReviewOutput {
  return {
    agent: agentName,
    thesis: `${agentName} review output was invalid and requires manual follow-up.`,
    score: 1,
    confidence: 0,
    blocked: true,
    blockers: [`Invalid review output schema: ${reason}`],
    risks: [
      {
        type: "schema_validation",
        severity: 9,
        evidence: "LLM response did not match required ReviewOutput schema.",
      },
    ],
    citations: [],
    required_changes: ["Regenerate review with strict JSON schema compliance."],
    approval_conditions: [],
    apga_impact_view: "Unknown due to invalid review output.",
    governance_checks_met: {},
  };
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(10, Number(value.toFixed(2))));
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function isRiskWeightedAgent(agentId: string): boolean {
  const lowered = agentId.toLowerCase();
  return (
    lowered === "compliance" ||
    lowered === "cfo" ||
    lowered === "pre-mortem" ||
    lowered === "resource-competitor"
  );
}

function isGrowthWeightedAgent(agentId: string): boolean {
  const lowered = agentId.toLowerCase();
  return lowered === "ceo" || lowered === "cto";
}

function reviewDisposition(review: ReviewOutput): "blocked" | "challenged" | "approved" {
  if (review.blocked) {
    return "blocked";
  }
  if (review.score < DQS_THRESHOLD || review.confidence < CONFIDENCE_THRESHOLD) {
    return "challenged";
  }
  return "approved";
}

function conflictAdjustedWeight(agentId: string, review: ReviewOutput): number {
  const baseWeight = CORE_DQS_WEIGHTS[agentId] ?? EXTRA_AGENT_WEIGHT;
  const disposition = reviewDisposition(review);

  if (isRiskWeightedAgent(agentId) && disposition !== "approved") {
    return baseWeight * 1.35;
  }

  if (isGrowthWeightedAgent(agentId) && disposition === "approved") {
    return baseWeight * 0.85;
  }

  return baseWeight;
}

function dissentPenaltyByAgent(agentId: string, score: number, blocked: boolean): number {
  const lowered = agentId.toLowerCase();
  const blockPenalty =
    lowered === "compliance" || lowered === "cfo"
      ? 2
      : lowered === "cto"
        ? 1.4
        : 1;

  if (blocked) {
    return blockPenalty;
  }

  const deficit = Math.max(0, 7 - score);
  if (deficit <= 0) {
    return 0;
  }

  if (lowered === "compliance" || lowered === "cfo") {
    return deficit * 0.35;
  }
  if (lowered === "cto") {
    return deficit * 0.25;
  }
  return deficit * 0.12;
}

function buildSynthesisEvidenceCitations(reviews: Record<string, ReviewOutput>): string[] {
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

function specializedConfidenceValues(reviews: Record<string, ReviewOutput>): number[] {
  return ["cfo", "cto", "compliance", "pre-mortem", "resource-competitor"]
    .map((agentId) => reviews[agentId]?.confidence)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function hasLowSpecializedConfidence(reviews: Record<string, ReviewOutput>): boolean {
  const values = specializedConfidenceValues(reviews);
  if (values.length === 0) {
    return false;
  }
  return values.some((value) => value < CONFIDENCE_THRESHOLD);
}

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

async function runMarketIntelligence(state: WorkflowState, deps: WorkflowDependencies): Promise<WorkflowState> {
  if (!deps.includeExternalResearch || !state.decision_snapshot) {
    return {
      ...state,
      market_intelligence: null,
    };
  }

  const analystSeeds: Array<{ id: string; analyst: string }> = [
    ...deps.agentConfigs.map((config) => ({
      id: config.id,
      analyst: config.role.trim().length > 0 ? config.role : config.name,
    })),
    { id: "market-intelligence", analyst: "Market Intelligence Analyst" },
    { id: "competitor-intelligence", analyst: "Competitor Intelligence Analyst" },
  ];

  const uniqueAnalysts = new Map<string, { id: string; analyst: string }>();
  for (const entry of analystSeeds) {
    const normalizedKey = `${entry.id}:${entry.analyst}`.toLowerCase();
    if (!uniqueAnalysts.has(normalizedKey)) {
      uniqueAnalysts.set(normalizedKey, entry);
    }
  }

  const results = await Promise.all(
    [...uniqueAnalysts.values()].map(async (entry) => {
      const report = await fetchTavilyResearch({
        agentName: entry.analyst,
        snapshot: state.decision_snapshot as unknown as Record<string, unknown>,
        missingSections: state.missing_sections,
        maxResults: 3,
      });

      return { entry, report };
    }),
  );

  const signals: WorkflowMarketIntelligenceSignal[] = [];
  const sourceUrls = new Set<string>();
  const highlights = new Set<string>();

  for (const { entry, report } of results) {
    if (!report || report.items.length === 0) {
      continue;
    }

    const itemHighlights = report.items.slice(0, 2).map((item) => `${item.title}: ${item.snippet}`);
    for (const item of report.items) {
      sourceUrls.add(item.url);
    }
    for (const highlight of itemHighlights) {
      highlights.add(highlight);
    }

    signals.push({
      analyst: entry.analyst,
      lens: report.lens,
      query: report.query,
      highlights: itemHighlights,
      source_urls: report.items.map((item) => item.url),
    });
  }

  if (signals.length === 0) {
    return {
      ...state,
      market_intelligence: null,
    };
  }

  return {
    ...state,
    market_intelligence: {
      generated_at: new Date().toISOString(),
      highlights: [...highlights].slice(0, 8),
      source_urls: [...sourceUrls].slice(0, 10),
      signals,
    },
  };
}

function runEvidenceVerification(state: WorkflowState, deps: WorkflowDependencies): WorkflowState {
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

function deriveArtifactAssistantQuestions(state: WorkflowState): string[] {
  const questions: string[] = [];

  for (const section of state.missing_sections.slice(0, 4)) {
    questions.push(`What concrete evidence will you add to satisfy the missing "${section}" section?`);
  }

  for (const finding of state.hygiene_findings ?? []) {
    if (finding.status === "pass") {
      continue;
    }

    if (finding.check === "financial_sanity") {
      questions.push(
        "How do your investment, projected benefit, and risk-adjusted ROI connect numerically, and what assumptions support them?",
      );
      continue;
    }

    if (finding.check === "market_size_vs_revenue" || finding.check === "financial_table_sanity") {
      questions.push(
        "If the market-size assumptions change by 30%, does projected revenue still hold and what is your blocked threshold?",
      );
      continue;
    }

    if (finding.check.startsWith("metadata_consistency")) {
      questions.push(
        "Where exactly in the decision document do you define the primary KPI mechanism and why it is the right success signal?",
      );
    }
  }

  const lowConfidenceReviews = Object.values(state.reviews)
    .filter((review) => review.confidence < CONFIDENCE_THRESHOLD)
    .slice(0, 2);
  for (const review of lowConfidenceReviews) {
    questions.push(
      `${review.agent} confidence is low (${Math.round(review.confidence * 100)}%). What specific evidence would raise confidence above 70%?`,
    );
  }

  const evidenceGaps = state.evidence_verification?.by_agent
    ?.filter((result) => result.verdict === "insufficient")
    .slice(0, 2);
  for (const result of evidenceGaps ?? []) {
    for (const gap of result.gaps.slice(0, 2)) {
      questions.push(`${result.agent_name} evidence gap: ${gap} What verifiable source will you add to close it?`);
    }
  }

  return [...new Set(questions)].slice(0, 8);
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

async function getAgentReviewOutput(
  agent: ConfiguredReviewAgent | ConfiguredComplianceAgent,
  state: WorkflowState,
  missingSections: string[],
  memoryContext: Record<string, unknown> = {},
): Promise<ReviewOutput> {
  const context: AgentContext = {
    snapshot: state.decision_snapshot ? (state.decision_snapshot as unknown as Record<string, unknown>) : {},
    memory_context: {
      missing_sections: missingSections,
      governance_checkbox_fields: GOVERNANCE_CHECKBOX_FIELDS,
      ...memoryContext,
    },
  };

  const agentName = agent.name ?? "UnknownAgent";

  try {
    const rawReview = await agent.evaluate(context);
    const validated = reviewOutputSchema.safeParse(rawReview);

    if (!validated.success) {
      return invalidReviewFallback(agentName, "zod validation failed");
    }

    return validated.data;
  } catch {
    return invalidReviewFallback(agentName, "agent evaluate call failed");
  }
}

async function buildDecisionState(state: WorkflowState): Promise<WorkflowState> {
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
  };

  return {
    ...nextState,
    artifact_assistant_questions: deriveArtifactAssistantQuestions(nextState),
  };
}

async function runExecutiveReviews(state: WorkflowState, deps: WorkflowDependencies): Promise<WorkflowState> {
  const reviews: Record<string, ReviewOutput> = {};
  const sharedMemoryContext = {
    decision_ancestry: state.decision_ancestry ?? [],
    hygiene_score: state.hygiene_score ?? 0,
    hygiene_findings: state.hygiene_findings ?? [],
    market_intelligence: state.market_intelligence ?? null,
  };

  const promises = deps.agentConfigs.map(async (config) => {
    const runtime = resolveRuntimeConfig(config, deps);
    const agent = createReviewAgent(runtime, deps);
    return {
      id: runtime.id,
      output: await getAgentReviewOutput(agent, state, state.missing_sections, sharedMemoryContext),
    };
  });

  const results = await Promise.all(promises);
  for (const result of results) {
    reviews[result.id] = result.output;
  }

  const nextState: WorkflowState = {
    ...state,
    reviews,
    status: "REVIEWING",
  };

  return {
    ...nextState,
    artifact_assistant_questions: deriveArtifactAssistantQuestions(nextState),
  };
}

async function runInteractionRounds(state: WorkflowState, deps: WorkflowDependencies): Promise<WorkflowState> {
  const initialReviewCount = Object.keys(state.reviews).length;
  if (deps.interactionRounds <= 0 || initialReviewCount < 2) {
    return state;
  }

  let updatedReviews = { ...state.reviews };
  const rounds: AgentInteractionRound[] = [];

  for (let round = 1; round <= deps.interactionRounds; round += 1) {
    const previousReviews = updatedReviews;
    const promises = deps.agentConfigs.map(async (config) => {
      const baseline = previousReviews[config.id];
      if (!baseline) {
        return { id: config.id, output: null as ReviewOutput | null };
      }

      const runtime = resolveRuntimeConfig(config, deps);
      const agent = createReviewAgent(runtime, deps);
      const peerReviews = buildPeerReviewContext(previousReviews, config.id);

      const output = await getAgentReviewOutput(agent, state, state.missing_sections, {
        interaction_round: round,
        prior_self_review: baseline,
        peer_reviews: peerReviews,
        decision_ancestry: state.decision_ancestry ?? [],
        hygiene_score: state.hygiene_score ?? 0,
        hygiene_findings: state.hygiene_findings ?? [],
        market_intelligence: state.market_intelligence ?? null,
      });

      return { id: config.id, output };
    });

    const results = await Promise.all(promises);
    const revisedReviews: Record<string, ReviewOutput> = { ...previousReviews };
    for (const result of results) {
      if (result.output) {
        revisedReviews[result.id] = result.output;
      }
    }

    const deltas = buildInteractionDeltas(previousReviews, revisedReviews, deps.agentConfigs);
    rounds.push({
      round,
      summary: summarizeInteractionRound(round, deltas),
      deltas,
    });

    updatedReviews = revisedReviews;
  }

  const nextState: WorkflowState = {
    ...state,
    reviews: updatedReviews,
    interaction_rounds: rounds,
    status: "REVIEWING",
  };

  return {
    ...nextState,
    artifact_assistant_questions: deriveArtifactAssistantQuestions(nextState),
  };
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

  if (evidenceCitations.length > 0) {
    const hasEvidenceSection = synthesis.executive_summary.toLowerCase().includes("evidence citations:");
    if (!hasEvidenceSection) {
      synthesis.executive_summary = `${synthesis.executive_summary}\nEvidence citations:\n- ${evidenceCitations.join("\n- ")}`;
    }
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
    chairperson_evidence_citations: evidenceCitations,
    synthesis: {
      ...synthesis,
      final_recommendation: finalRecommendation,
      blockers: [...new Set(blockers)].slice(0, 6),
      required_revisions: [...new Set(revisions)].slice(0, 8),
    },
  };
}

async function synthesizeReviews(state: WorkflowState, deps: WorkflowDependencies): Promise<WorkflowState> {
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

function calculateDqs(state: WorkflowState): WorkflowState {
  const reviewEntries = Object.entries(state.reviews);
  if (reviewEntries.length === 0) {
    return {
      ...state,
      dqs: 0,
      substance_score: 0,
      confidence_score: 0,
      dissent_penalty: 0,
      confidence_penalty: 0,
    };
  }

  let weightedScore = 0;
  let totalWeight = 0;
  let dissentPenalty = 0;

  for (const [agentId, review] of reviewEntries) {
    const weight = conflictAdjustedWeight(agentId, review);
    weightedScore += review.score * weight;
    totalWeight += weight;
    dissentPenalty += dissentPenaltyByAgent(agentId, review.score, review.blocked) * Math.max(0.8, weight);
  }

  const substanceScore = totalWeight > 0 ? weightedScore / totalWeight : 0;
  const confidenceScore = average(specializedConfidenceValues(state.reviews));
  const confidencePenalty = Math.max(0, CONFIDENCE_THRESHOLD - confidenceScore) * 2.5;
  const hygieneScore = clampScore(state.hygiene_score ?? 0);
  const adjustedSubstance = clampScore(substanceScore - dissentPenalty - confidencePenalty);
  const dqs = clampScore(adjustedSubstance * SUBSTANCE_WEIGHT + hygieneScore * HYGIENE_WEIGHT);

  return {
    ...state,
    dqs,
    substance_score: clampScore(substanceScore),
    confidence_score: Number(confidenceScore.toFixed(4)),
    dissent_penalty: Number(dissentPenalty.toFixed(4)),
    confidence_penalty: Number(confidencePenalty.toFixed(4)),
  };
}

async function decideGate(state: WorkflowState): Promise<GateDecision> {
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

function generatePrd(state: WorkflowState): WorkflowState {
  return {
    ...state,
    prd: buildPrdOutput(state),
    status: "DECIDED",
  };
}

async function persistArtifacts(state: WorkflowState, gateDecision: GateDecision): Promise<WorkflowState> {
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

export async function runDecisionWorkflow(options: RunWorkflowOptions): Promise<WorkflowState> {
  const deps = buildDependencies(options);

  let state = initialState(options);
  state = await buildDecisionState(state);
  state = await runMarketIntelligence(state, deps);
  state = await runExecutiveReviews(state, deps);
  state = await runInteractionRounds(state, deps);
  state = runEvidenceVerification(state, deps);
  state = calculateDqs(state);
  state = await synthesizeReviews(state, deps);
  state = {
    ...state,
    artifact_assistant_questions: deriveArtifactAssistantQuestions(state),
  };

  const gateDecision = await decideGate(state);

  if (gateDecision === "approved") {
    state = generatePrd(state);
  }

  state = await persistArtifacts(state, gateDecision);
  return state;
}

export async function runAllProposedDecisions(options?: Partial<RunWorkflowOptions>): Promise<WorkflowState[]> {
  const deps = buildDependencies(options);
  const proposedDecisionIds = await listProposedDecisionIds();
  const maxBulkRuns = maxBulkRunDecisions();

  if (proposedDecisionIds.length > maxBulkRuns) {
    throw new Error(`Bulk run limit exceeded: ${proposedDecisionIds.length} decisions exceed limit ${maxBulkRuns}`);
  }

  const states: WorkflowState[] = [];

  for (const decisionId of proposedDecisionIds) {
    let state = initialState({
      decisionId,
      userContext: options?.userContext,
      businessConstraints: options?.businessConstraints,
      strategicGoals: options?.strategicGoals,
      modelName: options?.modelName,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
      interactionRounds: options?.interactionRounds,
    });

    state = await buildDecisionState(state);
    state = await runMarketIntelligence(state, deps);
    state = await runExecutiveReviews(state, deps);
    state = await runInteractionRounds(state, deps);
    state = runEvidenceVerification(state, deps);
    state = calculateDqs(state);
    state = await synthesizeReviews(state, deps);
    state = {
      ...state,
      artifact_assistant_questions: deriveArtifactAssistantQuestions(state),
    };

    const gateDecision = await decideGate(state);
    if (gateDecision === "approved") {
      state = generatePrd(state);
    }

    state = await persistArtifacts(state, gateDecision);
    states.push(state);
  }

  return states;
}
