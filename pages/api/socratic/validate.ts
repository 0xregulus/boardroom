import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import { safeJsonParse } from "../../../src/agents/base";
import { resolveModelForProvider, resolveProvider } from "../../../src/config/llm_providers";
import { ProviderClientRegistry } from "../../../src/llm/client";
import { enforceRateLimit, enforceSensitiveRouteAccess } from "../../../src/security/request_guards";

const mitigationValidationSchema = z
  .object({
    riskTitle: z.string().trim().min(3).max(220),
    riskDescription: z.string().trim().min(3).max(500),
    mitigationText: z.string().trim().min(10).max(2000),
    riskLevel: z.enum(["Critical", "Warning"]).optional(),
  })
  .strict();

const mitigationValidationResponseSchema = z
  .object({
    approved: z.boolean(),
    feedback: z.string().trim().min(3).max(800),
  })
  .strict();

const VALIDATOR_MAX_TOKENS = 400;
const VALIDATOR_TEMPERATURE = 0.05;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ approved?: boolean; feedback?: string; error?: string }>,
): Promise<void> {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  if (
    !(await enforceRateLimit(req, res, {
      routeKey: "api/socratic/validate",
      limit: 120,
      windowMs: 60_000,
    }))
  ) {
    return;
  }

  if (!enforceSensitiveRouteAccess(req, res)) {
    return;
  }

  const parsed = mitigationValidationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid mitigation validation payload." });
    return;
  }

  const { riskTitle, riskDescription, mitigationText, riskLevel = "Warning" } = parsed.data;

  try {
    const preferredProvider = resolveProvider(process.env.BOARDROOM_PROVIDER);
    const modelName = resolveModelForProvider(preferredProvider, process.env.BOARDROOM_MODEL ?? "gpt-4o-mini");
    const providerClients = new ProviderClientRegistry();
    const client = providerClients.getResilientClient(preferredProvider);

    const completion = await client.complete({
      model: modelName,
      systemMessage: [
        "You are a Senior Strategic Auditor.",
        "Validate whether the mitigation truly addresses the stated risk.",
        "Reject hand-waving, vague intent, and generic responses.",
        "Approve only concrete, executable mitigation plans tied to the failure mode.",
        "Return strict JSON only: {\"approved\": boolean, \"feedback\": string}.",
      ].join(" "),
      userMessage: JSON.stringify(
        {
          risk: {
            title: riskTitle,
            description: riskDescription,
            level: riskLevel,
          },
          mitigation: mitigationText,
          checks: [
            "Specific actions and controls",
            "Owner/team and timeline",
            "Direct linkage to the named failure state",
            "Contingency or rollback path where relevant",
          ],
        },
        null,
        2,
      ),
      temperature: VALIDATOR_TEMPERATURE,
      maxTokens: VALIDATOR_MAX_TOKENS,
      requireJsonObject: true,
    });

    const json = safeJsonParse(completion);
    const normalized = mitigationValidationResponseSchema.safeParse(json);
    if (!normalized.success) {
      res.status(200).json({
        approved: false,
        feedback: "Mitigation could not be validated as a concrete plan. Add explicit actions, owner, and timing.",
      });
      return;
    }

    res.status(200).json(normalized.data);
  } catch (error) {
    console.error("[api/socratic/validate] mitigation validation failed", error);
    res.status(500).json({ error: "Validation Error" });
  }
}

