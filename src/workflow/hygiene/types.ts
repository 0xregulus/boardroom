export type HygieneFindingStatus = "pass" | "warning" | "fail";

export interface HygieneFinding {
  check: string;
  status: HygieneFindingStatus;
  detail: string;
  score_impact: number;
}

export interface HygieneEvaluation {
  score: number;
  findings: HygieneFinding[];
}
