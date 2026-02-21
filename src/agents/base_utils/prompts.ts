import { getPromptDefinition } from "../../prompts";
import type { ReviewOutput } from "../../schemas/review_output";

export function invalidReviewFallback(agentName: string, reason: string): ReviewOutput {
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

export interface PromptPayload {
  systemMessage: string;
  userTemplate: string;
}

export async function loadPrompts(agentName: string): Promise<PromptPayload> {
  const prompt = getPromptDefinition(agentName);
  if (!prompt) {
    throw new Error(`Prompt definition not found for agent "${agentName}"`);
  }

  return {
    systemMessage: prompt.systemMessage,
    userTemplate: prompt.userTemplate,
  };
}

export function renderTemplate(template: string, variables: Record<string, string>): string {
  let rendered = template;

  for (const [key, value] of Object.entries(variables)) {
    rendered = rendered.replaceAll(`{${key}}`, value);
  }

  return rendered;
}
