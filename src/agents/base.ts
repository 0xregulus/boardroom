import { chairpersonSynthesisSchema, ReviewOutput } from "../schemas";
import { LLMClient } from "../llm/client";
import { fetchResearch, formatResearch, type ResearchProvider } from "../research";
import { resolveResearchProvider } from "../research/providers";
import { sanitizeForExternalUse } from "../security/redaction";
import { ChairpersonSynthesis } from "../workflow/states";
import {
  buildDecisionAncestryRuntimeInstruction,
  buildHygieneRuntimeInstruction,
  buildInteractionRuntimeInstruction,
  buildMarketIntelligenceRuntimeInstruction,
  buildRiskSimulationRuntimeInstruction,
  buildReviewJsonContractInstruction,
  buildReviewRuntimeContextInstruction,
  loadPrompts,
  parseReviewOutput,
  renderTemplate,
  safeJsonParse,
  withResearchContext,
  type PromptPayload,
} from "./base_utils";

export { safeJsonParse } from "./base_utils";

export interface AgentContext {
  snapshot: Record<string, unknown>;
  memory_context: Record<string, unknown>;
}

export interface AgentRuntimeOptions {
  displayName?: string;
  promptOverride?: PromptPayload;
  provider?: string;
  includeExternalResearch?: boolean;
  researchProvider?: ResearchProvider;
}


export abstract class BaseAgent {
  readonly name: string;
  protected readonly displayName: string;
  protected readonly provider: string;
  protected readonly llmClient: LLMClient;
  protected readonly modelName: string;
  protected readonly temperature: number;
  protected readonly maxTokens: number;
  protected readonly includeExternalResearch: boolean;
  protected readonly researchProvider: ResearchProvider;

  private prompts: PromptPayload | null;

  protected constructor(
    name: string,
    llmClient: LLMClient,
    modelName = "gpt-4o-mini",
    temperature = 0.2,
    maxTokens = 1200,
    options?: AgentRuntimeOptions,
  ) {
    this.name = name;
    this.displayName = options?.displayName && options.displayName.trim().length > 0 ? options.displayName.trim() : name;
    this.provider = options?.provider ?? llmClient.provider;
    this.llmClient = llmClient;
    this.modelName = modelName;
    this.temperature = temperature;
    this.maxTokens = maxTokens;
    this.includeExternalResearch = options?.includeExternalResearch ?? false;
    this.researchProvider = resolveResearchProvider(options?.researchProvider);
    this.prompts = options?.promptOverride ?? null;
  }

  protected async getPrompts(): Promise<PromptPayload> {
    if (!this.prompts) {
      this.prompts = await loadPrompts(this.name);
    }

    return this.prompts;
  }

  protected renderUserTemplate(template: string, variables: Record<string, string>): string {
    return renderTemplate(template, variables);
  }

  protected placeholderOutput(reason = "LLM output missing or malformed."): ReviewOutput {
    return {
      agent: this.name,
      thesis: `${this.name} review unavailable due to output parsing failure.`,
      score: 1,
      confidence: 0,
      blocked: true,
      blockers: [reason],
      risks: [
        {
          type: "llm_output_error",
          severity: 8,
          evidence: reason,
        },
      ],
      citations: [],
      required_changes: ["Regenerate review with strict valid JSON output."],
      approval_conditions: [],
      apga_impact_view: "Unknown due to invalid model output.",
      governance_checks_met: {},
    };
  }

  abstract evaluate(context: AgentContext): Promise<ReviewOutput | ChairpersonSynthesis>;
}

export abstract class BaseReviewAgent extends BaseAgent {
  protected constructor(
    name: string,
    llmClient: LLMClient,
    modelName = "gpt-4o-mini",
    temperature = 0.2,
    maxTokens = 1200,
    options?: AgentRuntimeOptions,
  ) {
    super(name, llmClient, modelName, temperature, maxTokens, options);
  }

  async evaluate(context: AgentContext): Promise<ReviewOutput> {
    const prompts = await this.getPrompts();

    const sanitizedSnapshot = sanitizeForExternalUse(context.snapshot) as Record<string, unknown>;
    const snapshotJson = JSON.stringify(sanitizedSnapshot, null, 2);
    const missing = Array.isArray(context.memory_context.missing_sections)
      ? (context.memory_context.missing_sections as string[])
      : [];
    const missingSectionsStr = missing.length > 0 ? missing.join(", ") : "None";

    const governanceFields = Array.isArray(context.memory_context.governance_checkbox_fields)
      ? (context.memory_context.governance_checkbox_fields as string[])
      : [];
    const governanceFieldsStr = governanceFields.length > 0 ? governanceFields.join(", ") : "None";

    const research = this.includeExternalResearch
      ? await fetchResearch(
          {
            agentName: this.displayName,
            snapshot: sanitizedSnapshot,
            missingSections: missing,
          },
          this.researchProvider,
        )
      : null;
    const researchBlock = formatResearch(research, this.researchProvider);

    const baseUserMessage = this.renderUserTemplate(prompts.userTemplate, {
      snapshot_json: snapshotJson,
      missing_sections_str: missingSectionsStr,
      governance_checkbox_fields_str: governanceFieldsStr,
      agent_name: this.displayName,
      provider: this.provider,
    });

    const runtimeContextInstruction = buildReviewRuntimeContextInstruction(
      snapshotJson,
      missingSectionsStr,
      governanceFieldsStr,
    );
    const interactionRuntimeInstruction = buildInteractionRuntimeInstruction(context.memory_context);
    const ancestryRuntimeInstruction = buildDecisionAncestryRuntimeInstruction(context.memory_context);
    const marketIntelligenceRuntimeInstruction = buildMarketIntelligenceRuntimeInstruction(context.memory_context);
    const hygieneRuntimeInstruction = buildHygieneRuntimeInstruction(context.memory_context);
    const riskSimulationRuntimeInstruction = buildRiskSimulationRuntimeInstruction(context.memory_context);
    const userMessage = `${withResearchContext(baseUserMessage, researchBlock)}\n\n${runtimeContextInstruction}${interactionRuntimeInstruction ? `\n\n${interactionRuntimeInstruction}` : ""
      }${ancestryRuntimeInstruction ? `\n\n${ancestryRuntimeInstruction}` : ""}${marketIntelligenceRuntimeInstruction ? `\n\n${marketIntelligenceRuntimeInstruction}` : ""
      }${hygieneRuntimeInstruction ? `\n\n${hygieneRuntimeInstruction}` : ""}${riskSimulationRuntimeInstruction ? `\n\n${riskSimulationRuntimeInstruction}` : ""
      }\n\n${buildReviewJsonContractInstruction(this.name, governanceFields)}`;

    try {
      const content = await this.llmClient.complete({
        model: this.modelName,
        systemMessage: prompts.systemMessage,
        userMessage,
        temperature: this.temperature,
        maxTokens: this.maxTokens,
        requireJsonObject: true,
      });

      if (!content) {
        return this.placeholderOutput(`${this.name} model returned empty content.`);
      }

      const validated = parseReviewOutput(content, this.name, governanceFields);
      if (!validated) {
        return this.placeholderOutput(`${this.name} JSON schema validation failed.`);
      }

      return validated;
    } catch (error) {
      console.error(`[BaseReviewAgent] ${this.name} LLM call failed`, error);
      return this.placeholderOutput(`${this.name} LLM call failed: ${String(error)}`);
    }
  }
}

export class ConfiguredReviewAgent extends BaseReviewAgent {
  constructor(
    role: string,
    llmClient: LLMClient,
    modelName = "gpt-4o-mini",
    temperature = 0.2,
    maxTokens = 1200,
    options?: AgentRuntimeOptions,
  ) {
    super(role, llmClient, modelName, temperature, maxTokens, options);
  }
}

export class ConfiguredComplianceAgent extends BaseAgent {
  constructor(
    llmClient: LLMClient,
    modelName = "gpt-4o-mini",
    temperature = 0.2,
    maxTokens = 1200,
    options?: AgentRuntimeOptions,
  ) {
    super("Compliance", llmClient, modelName, temperature, maxTokens, options);
  }

  async evaluate(context: AgentContext): Promise<ReviewOutput> {
    const prompts = await this.getPrompts();

    const sanitizedSnapshot = sanitizeForExternalUse(context.snapshot) as Record<string, unknown>;
    const snapshotJson = JSON.stringify(sanitizedSnapshot);
    const missing = Array.isArray(context.memory_context.missing_sections)
      ? (context.memory_context.missing_sections as string[])
      : [];
    const missingSectionsStr = missing.length > 0 ? missing.join(", ") : "None";

    const governanceFields = Array.isArray(context.memory_context.governance_checkbox_fields)
      ? (context.memory_context.governance_checkbox_fields as string[])
      : [];
    const governanceFieldsStr = governanceFields.length > 0 ? governanceFields.join(", ") : "None";

    const research = this.includeExternalResearch
      ? await fetchResearch(
          {
            agentName: this.displayName,
            snapshot: sanitizedSnapshot,
            missingSections: missing,
          },
          this.researchProvider,
        )
      : null;
    const researchBlock = formatResearch(research, this.researchProvider);

    let userMessage = withResearchContext(
      this.renderUserTemplate(prompts.userTemplate, {
        snapshot_json: snapshotJson,
        missing_sections_str: missingSectionsStr,
        governance_checkbox_fields_str: governanceFieldsStr,
        agent_name: this.displayName,
        provider: this.provider,
      }),
      researchBlock,
    );
    const interactionRuntimeInstruction = buildInteractionRuntimeInstruction(context.memory_context);
    const ancestryRuntimeInstruction = buildDecisionAncestryRuntimeInstruction(context.memory_context);
    const marketIntelligenceRuntimeInstruction = buildMarketIntelligenceRuntimeInstruction(context.memory_context);
    const hygieneRuntimeInstruction = buildHygieneRuntimeInstruction(context.memory_context);
    const riskSimulationRuntimeInstruction = buildRiskSimulationRuntimeInstruction(context.memory_context);

    userMessage +=
      `\n\n${buildReviewRuntimeContextInstruction(snapshotJson, missingSectionsStr, governanceFieldsStr)}` +
      (interactionRuntimeInstruction ? `\n\n${interactionRuntimeInstruction}` : "") +
      (ancestryRuntimeInstruction ? `\n\n${ancestryRuntimeInstruction}` : "") +
      (marketIntelligenceRuntimeInstruction ? `\n\n${marketIntelligenceRuntimeInstruction}` : "") +
      (hygieneRuntimeInstruction ? `\n\n${hygieneRuntimeInstruction}` : "") +
      (riskSimulationRuntimeInstruction ? `\n\n${riskSimulationRuntimeInstruction}` : "") +
      `\n\n${buildReviewJsonContractInstruction(this.name, governanceFields)}` +
      "\nReturn concise JSON: thesis <= 60 words, max 3 blockers, max 3 risks, max 6 citations, max 3 required_changes, short evidence strings.";

    const maxTokenPlan = [this.maxTokens, this.maxTokens * 2];

    for (let i = 0; i < maxTokenPlan.length; i += 1) {
      try {
        const attemptUserMessage =
          i === 0
            ? userMessage
            : `${userMessage}\nPrevious attempt failed JSON validation. Re-output only strict valid JSON with the exact schema.`;

        const content = await this.llmClient.complete({
          model: this.modelName,
          systemMessage: prompts.systemMessage,
          userMessage: attemptUserMessage,
          temperature: this.temperature,
          maxTokens: maxTokenPlan[i],
          requireJsonObject: true,
        });

        if (content) {
          const validated = parseReviewOutput(content, this.name, governanceFields);
          if (validated) {
            return validated;
          }
        }
      } catch (error) {
        console.error(`[ConfiguredComplianceAgent] ${this.name} attempt ${i + 1} failed`, error);
        // Keep retry loop behavior aligned with the legacy Python implementation.
      }
    }

    return this.placeholderOutput("Compliance JSON parsing failed after retry.");
  }
}

export class ConfiguredChairpersonAgent extends BaseAgent {
  constructor(
    llmClient: LLMClient,
    modelName = "gpt-4o-mini",
    temperature = 0.2,
    maxTokens = 500,
    options?: AgentRuntimeOptions,
  ) {
    super("Chairperson", llmClient, modelName, temperature, maxTokens, options);
  }

  async evaluate(context: AgentContext): Promise<ChairpersonSynthesis> {
    const prompts = await this.getPrompts();
    const reviews = Array.isArray(context.snapshot.reviews) ? context.snapshot.reviews : [];
    const decisionAncestry = Array.isArray(context.memory_context.decision_ancestry)
      ? context.memory_context.decision_ancestry
      : [];
    const hygieneFindings = Array.isArray(context.memory_context.hygiene_findings)
      ? context.memory_context.hygiene_findings
      : [];
    const hygieneScore = typeof context.memory_context.hygiene_score === "number" ? context.memory_context.hygiene_score : null;
    const confidenceScore =
      typeof context.memory_context.confidence_score === "number" ? context.memory_context.confidence_score : null;
    const reviewEvidenceLines = Array.isArray(context.memory_context.review_evidence_lines)
      ? context.memory_context.review_evidence_lines
      : [];
    const riskSimulation =
      context.memory_context.risk_simulation &&
        typeof context.memory_context.risk_simulation === "object" &&
        !Array.isArray(context.memory_context.risk_simulation)
        ? context.memory_context.risk_simulation
        : null;
    const weightedConflictSignal =
      context.memory_context.weighted_conflict_signal &&
        typeof context.memory_context.weighted_conflict_signal === "object" &&
        !Array.isArray(context.memory_context.weighted_conflict_signal)
        ? context.memory_context.weighted_conflict_signal
        : {};
    const evidenceVerification =
      context.memory_context.evidence_verification &&
        typeof context.memory_context.evidence_verification === "object" &&
        !Array.isArray(context.memory_context.evidence_verification)
        ? context.memory_context.evidence_verification
        : null;

    const baseMessage = this.renderUserTemplate(prompts.userTemplate, {
      reviews_json: JSON.stringify(reviews, null, 2),
      agent_name: this.displayName,
      provider: this.provider,
    });
    const userMessage = [
      baseMessage,
      "",
      `Decision ancestry context: ${JSON.stringify(decisionAncestry)}`,
      `Automated hygiene score: ${hygieneScore !== null ? hygieneScore.toFixed(2) : "N/A"}`,
      `Automated hygiene findings: ${JSON.stringify(hygieneFindings)}`,
      `Specialized confidence score: ${confidenceScore !== null ? confidenceScore.toFixed(2) : "N/A"}`,
      `Weighted conflict signal: ${JSON.stringify(weightedConflictSignal)}`,
      riskSimulation ? `Monte Carlo risk simulation: ${JSON.stringify(riskSimulation)}` : "",
      evidenceVerification ? `Evidence verification summary: ${JSON.stringify(evidenceVerification)}` : "",
      reviewEvidenceLines.length > 0 ? `Executive evidence lines: ${JSON.stringify(reviewEvidenceLines)}` : "",
      "Weighted conflict policy: dissent from Compliance/CFO carries more weight than growth-only optimism.",
      "Evidence policy: include an 'Evidence citations:' section and cite concrete reviewer lines.",
    ].join("\n");

    const fallback: ChairpersonSynthesis = {
      executive_summary: "Chair synthesis failed; manual review required.",
      final_recommendation: "Challenged",
      consensus_points: [],
      point_of_contention: "",
      residual_risks: [],
      evidence_citations: [],
      conflicts: [],
      blockers: [],
      required_revisions: [],
    };

    try {
      const content = await this.llmClient.complete({
        model: this.modelName,
        systemMessage: prompts.systemMessage,
        userMessage,
        temperature: this.temperature,
        maxTokens: this.maxTokens,
        requireJsonObject: true,
      });

      if (!content) {
        return fallback;
      }

      const parsed = safeJsonParse(content);
      if (!parsed || typeof parsed !== "object") {
        return fallback;
      }

      const validated = chairpersonSynthesisSchema.safeParse(parsed);
      if (!validated.success) {
        return fallback;
      }

      return validated.data;
    } catch (error) {
      console.error(`[ConfiguredChairpersonAgent] ${this.name} synthesis failed`, error);
      return fallback;
    }
  }
}
