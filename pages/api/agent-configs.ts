import type { NextApiRequest, NextApiResponse } from "next";

import { AgentConfig, buildDefaultAgentConfigs, normalizeAgentConfigs } from "../../src/config/agent_config";
import { enforceRateLimit, enforceSensitiveRouteAccess } from "../../src/security/request_guards";
import { getPersistedAgentConfigs, upsertAgentConfigs } from "../../src/store/postgres";

interface AgentConfigBody {
  agentConfigs?: AgentConfig[];
}

function includeSensitiveFields(raw: unknown): boolean {
  if (Array.isArray(raw)) {
    return raw[0] === "true";
  }

  return raw === "true";
}

function redactAgentConfigPrompts(configs: AgentConfig[]): AgentConfig[] {
  return configs.map((config) => {
    const redacted = { ...config };

    if ("systemMessage" in redacted && typeof redacted.systemMessage === "string") {
      redacted.systemMessage = "[REDACTED]";
    }

    if ("userMessage" in redacted && typeof redacted.userMessage === "string") {
      redacted.userMessage = "[REDACTED]";
    }

    return redacted;
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (
    !(await enforceRateLimit(req, res, {
      routeKey: "api/agent-configs",
      limit: req.method === "PUT" ? 30 : 120,
      windowMs: 60_000,
    }))
  ) {
    return;
  }

  if (!enforceSensitiveRouteAccess(req, res)) {
    return;
  }

  if (req.method === "GET") {
    try {
      const persistedConfigs = await getPersistedAgentConfigs();
      const includeSensitive = includeSensitiveFields(req.query.includeSensitive);
      const resolvedConfigs = persistedConfigs ?? buildDefaultAgentConfigs();

      res.status(200).json({
        agentConfigs: includeSensitive ? resolvedConfigs : redactAgentConfigPrompts(resolvedConfigs),
        persisted: Boolean(persistedConfigs),
      });
      return;
    } catch (error) {
      console.error("[api/agent-configs] failed to load agent configs", error);
      res.status(500).json({
        error: "Failed to load agent configs",
      });
      return;
    }
  }

  if (req.method === "PUT") {
    try {
      const body = (req.body ?? {}) as AgentConfigBody;
      const normalized = normalizeAgentConfigs(body.agentConfigs);
      const savedConfigs = await upsertAgentConfigs(normalized);

      res.status(200).json({ agentConfigs: savedConfigs, persisted: true });
      return;
    } catch (error) {
      console.error("[api/agent-configs] failed to persist agent configs", error);
      res.status(500).json({
        error: "Failed to persist agent configs",
      });
      return;
    }
  }

  res.setHeader("Allow", "GET, PUT");
  res.status(405).json({ error: "Method not allowed" });
}
