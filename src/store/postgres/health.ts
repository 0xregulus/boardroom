import { query } from "./client";

export async function checkDatabaseHealth(): Promise<void> {
  await query("SELECT 1");
}
