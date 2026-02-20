import { z } from "zod";

export const chairpersonSynthesisSchema = z.object({
  executive_summary: z.string(),
  final_recommendation: z.enum(["Approved", "Challenged", "Blocked"]),
  consensus_points: z.array(z.string()).default([]),
  point_of_contention: z.string().default(""),
  residual_risks: z.array(z.string()).default([]),
  evidence_citations: z.array(z.string()).default([]),
  conflicts: z.array(z.string()).default([]),
  blockers: z.array(z.string()).default([]),
  required_revisions: z.array(z.string()).default([]),
});
