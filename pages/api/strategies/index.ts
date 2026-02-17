import type { NextApiRequest, NextApiResponse } from "next";

import { enforceRateLimit, enforceSensitiveRouteAccess } from "../../../src/security/request_guards";
import { listStrategicDecisionLogEntries as listPostgresStrategicDecisionLogEntries } from "../../../src/store/postgres";

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (
    !(await enforceRateLimit(req, res, {
      routeKey: "api/strategies/index",
      limit: 120,
      windowMs: 60_000,
    }))
  ) {
    return;
  }

  if (!enforceSensitiveRouteAccess(req, res)) {
    return;
  }

  try {
    const strategies = await listPostgresStrategicDecisionLogEntries();
    res.status(200).json({ strategies, source: "postgres" });
    return;
  } catch (error) {
    console.error("[api/strategies] failed to fetch strategies", error);
    res.status(500).json({
      error: "Failed to fetch strategic decisions from Strategic Decision Log",
    });
  }
}
