import { z } from "zod";

export interface ReviewRisk {
  type: string;
  severity: number;
  evidence: string;
}

export interface ReviewOutput {
  agent: string;
  thesis: string;
  score: number;
  confidence: number;
  blocked: boolean;
  blockers: string[];
  risks: ReviewRisk[];
  required_changes: string[];
  approval_conditions: string[];
  apga_impact_view: string;
  governance_checks_met: Record<string, boolean>;
}

export const reviewRiskSchema = z.object({
  type: z.string(),
  severity: z.number().int().min(1).max(10),
  evidence: z.string(),
});

export const reviewOutputSchema = z.object({
  agent: z.string(),
  thesis: z.string(),
  score: z.number().int().min(1).max(10),
  confidence: z.number().min(0).max(1),
  blocked: z.boolean(),
  blockers: z.array(z.string()).default([]),
  risks: z.array(reviewRiskSchema).default([]),
  required_changes: z.array(z.string()).default([]),
  approval_conditions: z.array(z.string()).default([]),
  apga_impact_view: z.string(),
  governance_checks_met: z.record(z.boolean()).default({}),
});
