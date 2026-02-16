import type { NextApiRequest, NextApiResponse } from "next";
import { checkDatabaseHealth } from "../../src/store/postgres";

export default async function handler(_req: NextApiRequest, res: NextApiResponse): Promise<void> {
  try {
    await checkDatabaseHealth();
    res.status(200).json({ ok: true, service: "boardroom-next", database: "postgresql" });
  } catch (error) {
    console.error("[api/health] database health check failed", error);
    res.status(503).json({
      ok: false,
      service: "boardroom-next",
      database: "postgresql",
      error: "Database unavailable",
    });
  }
}
