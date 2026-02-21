import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import { fetchResearch, resolveConfiguredResearchProvider } from "../../../src/research";
import { enforceRateLimit, enforceSensitiveRouteAccess } from "../../../src/security/request_guards";

const socraticResearchSchema = z
  .object({
    decisionName: z.string().max(180).optional(),
    sectionKey: z.string().trim().min(1).max(64),
    sectionContent: z.string().max(4000).optional(),
    prompt: z.string().max(600).optional(),
  })
  .strict();

interface SocraticResearchResponse {
  links: Array<{
    title: string;
    url: string;
    snippet: string;
    publishedDate: string | null;
  }>;
  provider: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<SocraticResearchResponse | { error: string }>): Promise<void> {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (
    !(await enforceRateLimit(req, res, {
      routeKey: "api/research/socratic",
      limit: 40,
      windowMs: 60_000,
    }))
  ) {
    return;
  }

  if (!enforceSensitiveRouteAccess(req, res)) {
    return;
  }

  const bodyResult = socraticResearchSchema.safeParse(req.body);
  if (!bodyResult.success) {
    res.status(400).json({ error: "Invalid request payload." });
    return;
  }

  const body = bodyResult.data;
  const sectionContent = (body.sectionContent ?? "").trim();
  const prompt = (body.prompt ?? "").trim();
  const decisionName = (body.decisionName ?? "").trim();
  if (sectionContent.length === 0 && prompt.length === 0) {
    res.status(400).json({ error: "Section content or prompt is required." });
    return;
  }

  try {
    const provider = resolveConfiguredResearchProvider("Tavily");
    const report = await fetchResearch(
      {
        agentName: "Socratic Mirror",
        maxResults: 6,
        snapshot: {
          properties: {
            Title: decisionName.length > 0 ? decisionName : "Strategic Decision Draft",
            "Problem Quantified": sectionContent,
            "Success Metrics Defined": prompt,
          },
          section_excerpt: [
            {
              text: {
                content: `${body.sectionKey}: ${sectionContent} ${prompt}`.trim(),
              },
            },
          ],
        },
      },
      provider,
    );

    const links =
      report?.items.map((item) => ({
        title: item.title,
        url: item.url,
        snippet: item.snippet,
        publishedDate: item.publishedDate,
      })) ?? [];

    res.status(200).json({
      links,
      provider,
    });
  } catch (error) {
    console.error("[api/research/socratic] failed to fetch research", error);
    res.status(500).json({ error: "Unable to fetch research right now." });
  }
}
