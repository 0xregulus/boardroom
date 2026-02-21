import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import { safeJsonParse } from "../../../src/agents/base";
import { resolveModelForProvider, resolveProvider } from "../../../src/config/llm_providers";
import { ProviderClientRegistry } from "../../../src/llm/client";
import { enforceRateLimit, enforceSensitiveRouteAccess } from "../../../src/security/request_guards";

const substanceRequestSchema = z
    .object({
        riskTitle: z.string().trim().min(3).max(220),
        riskDescription: z.string().trim().min(3).max(500),
        mitigationText: z.string().trim().min(10).max(2000),
    })
    .strict();

const substanceResponseSchema = z
    .object({
        substanceScore: z.number().min(0).max(1),
        approved: z.boolean(),
        feedback: z.string().trim().min(3).max(800),
    });

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse,
): Promise<void> {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        res.status(405).json({ error: "Method not allowed." });
        return;
    }

    if (
        !(await enforceRateLimit(req, res, {
            routeKey: "api/socratic/validate-substance",
            limit: 60,
            windowMs: 60_000,
        }))
    ) {
        return;
    }

    if (!enforceSensitiveRouteAccess(req, res)) {
        return;
    }

    const parsed = substanceRequestSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "Invalid substance validation payload." });
        return;
    }

    const { riskTitle, riskDescription, mitigationText } = parsed.data;

    try {
        const preferredProvider = resolveProvider(process.env.BOARDROOM_PROVIDER);
        const modelName = resolveModelForProvider(preferredProvider, "gpt-4-turbo-preview");
        const providerClients = new ProviderClientRegistry();
        const client = providerClients.getResilientClient(preferredProvider);

        const completion = await client.complete({
            model: modelName,
            systemMessage: [
                "You are a Senior Strategic Auditor.",
                "Your task is to evaluate the substance and causal logic of a risk mitigation plan.",
                "Reject mitigations that lack logic, specific actions, or causal linkage to the risk.",
                "A substance score of 1.0 means perfectly executable and logical; below 0.7 means insufficient.",
                "Return strict JSON only: {\"substanceScore\": number, \"approved\": boolean, \"feedback\": string}.",
            ].join(" "),
            userMessage: `Risk: ${riskTitle} - ${riskDescription}\nMitigation: ${mitigationText}`,
            temperature: 0.0,
            maxTokens: 500,
            requireJsonObject: true,
        });

        const json = safeJsonParse(completion);
        const normalized = substanceResponseSchema.safeParse(json);
        if (!normalized.success) {
            // Fallback if the LLM didn't return perfect structure but we got a result
            if (typeof json === "object" && json !== null && "approved" in json) {
                res.status(200).json({
                    substanceScore: (json as any).substanceScore ?? 0.5,
                    approved: (json as any).approved,
                    feedback: (json as any).feedback ?? "Substance evaluation completed.",
                });
                return;
            }
            res.status(500).json({ error: "Invalid validator response format." });
            return;
        }

        res.status(200).json(normalized.data);
    } catch (error) {
        console.error("[api/socratic/validate-substance] substance validation failed", error);
        res.status(500).json({ error: "Validation Error" });
    }
}
