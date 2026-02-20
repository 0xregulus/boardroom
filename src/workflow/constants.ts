export const DQS_THRESHOLD = 7.0;
export const HYGIENE_THRESHOLD = 6.5;
export const CONFIDENCE_THRESHOLD = 0.6;
export const CORE_DQS_WEIGHTS: Record<string, number> = {
    ceo: 0.3,
    cfo: 0.25,
    cto: 0.25,
    compliance: 0.2,
};
export const EXTRA_AGENT_WEIGHT = 0.2;
export const SUBSTANCE_WEIGHT = 0.75;
export const HYGIENE_WEIGHT = 0.25;

export const STATUS_APPROVED = "Approved";
export const STATUS_BLOCKED = "Blocked";
export const STATUS_CHALLENGED = "Challenged";
export const STATUS_INCOMPLETE = "Incomplete";
export const STATUS_UNDER_EVALUATION = "Under Evaluation";

export const DEFAULT_TEMPERATURE = 0.2;
export const DEFAULT_MAX_TOKENS = 1200;
export const MIN_TEMPERATURE = 0;
export const MAX_TEMPERATURE = 1;
export const MIN_MAX_TOKENS = 256;
export const MAX_MAX_TOKENS = 8000;
export const DEFAULT_MAX_BULK_RUN_DECISIONS = 50;
export const MAX_BULK_RUN_DECISIONS = 500;
export const DEFAULT_INTERACTION_ROUNDS = 1;
export const MIN_INTERACTION_ROUNDS = 0;
export const MAX_INTERACTION_ROUNDS = 5;
