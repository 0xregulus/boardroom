export { asRecord } from "./utils/parsing";

export {
  cloneMatrix,
  serializeSectionMatrix,
  defaultMatrixForSection,
  parseSectionMatrix,
  isSerializedSectionMatrix,
  isMatrixSectionKey,
} from "./utils/section-matrix";

export {
  initialCreateStrategyDraft,
  buildSocraticArtifactQuestions,
  appendSocraticAnswerToSection,
  sectionHasSocraticAnswer,
  buildCreateDraftFromStrategy,
} from "./utils/create-draft";

export {
  socraticPillarForSection,
  socraticPersonaForSection,
  buildSocraticSession,
  isSocraticSessionBoardReady,
} from "./utils/socratic-session";

export { buildStrategicDecisionDocument, buildSocraticLiveFeed } from "./utils/strategic-document";

export { firstLine, formatCurrency, formatDqs, formatRunTimestamp } from "./utils/formatting";

export {
  deriveRiskAdjustedValue,
  deriveRiskAdjustedRoi,
  deriveWeightedCapitalScore,
  deriveRiskScore,
  clampTokenInput,
} from "./utils/capital-metrics";

export {
  recommendationForState,
  recommendationTone,
  normalizeWorkflowStates,
  extractSnapshotMetrics,
  extractGovernanceRows,
  sortReviews,
} from "./utils/workflow-state";

export {
  buildReviewTasks,
  buildInteractionTasks,
  buildInitialNodes,
  strategyStatusTone,
  edgePathData,
} from "./utils/workflow-graph";

export { serializeAgentConfigs, sleep, resolveAgentChessPiece, agentModelMeta } from "./utils/agent-utils";
