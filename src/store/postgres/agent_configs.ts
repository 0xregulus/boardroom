import type { QueryResultRow } from "pg";

import { type AgentConfig, normalizeAgentConfigs } from "../../config/agent_config";
import { query } from "./client";
import { toNumber } from "./serializers";

interface AgentConfigRow extends QueryResultRow {
  agent_id: string;
  role: string;
  name: string;
  system_message: string;
  user_message: string;
  provider: string;
  model: string;
  temperature: string | number;
  max_tokens: string | number;
}

export async function getPersistedAgentConfigs(): Promise<AgentConfig[] | null> {
  const result = await query<AgentConfigRow>(
    `
      SELECT
        agent_id,
        role,
        name,
        system_message,
        user_message,
        provider,
        model,
        temperature,
        max_tokens
      FROM agent_configs
      ORDER BY agent_id ASC
    `,
  );

  if (result.rows.length === 0) {
    return null;
  }

  const rawConfigs = result.rows.map((row) => ({
    id: row.agent_id,
    role: row.role,
    name: row.name,
    systemMessage: row.system_message,
    userMessage: row.user_message,
    provider: row.provider,
    model: row.model,
    temperature: toNumber(row.temperature) ?? undefined,
    maxTokens: toNumber(row.max_tokens) ?? undefined,
  }));

  return normalizeAgentConfigs(rawConfigs);
}

export async function upsertAgentConfigs(agentConfigs: AgentConfig[]): Promise<AgentConfig[]> {
  const normalized = normalizeAgentConfigs(agentConfigs);
  const configuredAgentIds = normalized.map((config) => config.id);

  await query(
    `
      DELETE FROM agent_configs
      WHERE NOT (agent_id = ANY($1::text[]))
    `,
    [configuredAgentIds],
  );

  for (const config of normalized) {
    await query(
      `
        INSERT INTO agent_configs (
          agent_id,
          role,
          name,
          system_message,
          user_message,
          provider,
          model,
          temperature,
          max_tokens,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          NOW(),
          NOW()
        )
        ON CONFLICT (agent_id)
        DO UPDATE SET
          role = EXCLUDED.role,
          name = EXCLUDED.name,
          system_message = EXCLUDED.system_message,
          user_message = EXCLUDED.user_message,
          provider = EXCLUDED.provider,
          model = EXCLUDED.model,
          temperature = EXCLUDED.temperature,
          max_tokens = EXCLUDED.max_tokens,
          updated_at = NOW()
      `,
      [
        config.id,
        config.role,
        config.name,
        config.systemMessage,
        config.userMessage,
        config.provider,
        config.model,
        config.temperature,
        config.maxTokens,
      ],
    );
  }

  return normalized;
}
