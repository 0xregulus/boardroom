import { Pool, QueryResult, QueryResultRow } from "pg";

import { buildDefaultAgentConfigs } from "../../config/agent_config";
import { SCHEMA_SQL } from "./schema";

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

function getPool(): Pool {
  if (pool) {
    return pool;
  }

  const connectionString = process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error("POSTGRES_URL is required");
  }

  pool = new Pool({ connectionString });
  return pool;
}

async function seedDefaultAgentConfigsIfEmpty(): Promise<void> {
  const db = getPool();
  const countResult = await db.query<{ total: string }>("SELECT COUNT(*)::text AS total FROM agent_configs");
  const total = Number(countResult.rows[0]?.total ?? "0");

  if (!Number.isFinite(total) || total > 0) {
    return;
  }

  const defaults = buildDefaultAgentConfigs();
  for (const config of defaults) {
    await db.query(
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
        ON CONFLICT (agent_id) DO NOTHING
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
}

async function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await getPool().query(SCHEMA_SQL);
      await seedDefaultAgentConfigsIfEmpty();
    })();
  }

  try {
    await schemaReady;
  } catch (error) {
    schemaReady = null;
    throw error;
  }
}

export async function query<T extends QueryResultRow>(text: string, values: unknown[] = []): Promise<QueryResult<T>> {
  await ensureSchema();
  return getPool().query<T>(text, values);
}
