import { z } from "zod";

export const chairpersonSynthesisSchema = z.object({
  executive_summary: z.string(),
  final_recommendation: z.enum(["Approved", "Challenged", "Blocked"]),
  conflicts: z.array(z.string()).default([]),
  blockers: z.array(z.string()).default([]),
  required_revisions: z.array(z.string()).default([]),
});
