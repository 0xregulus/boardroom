import { useMemo } from "react";

import type { ApiResult, DecisionStrategy, WorkflowRunStateEntry } from "../types";
import {
  extractGovernanceRows,
  extractSnapshotMetrics,
  firstLine,
  normalizeWorkflowStates,
  recommendationForState,
  recommendationTone,
  sortReviews,
} from "../utils";

interface UseWorkflowPreviewDataParams {
  result: ApiResult | null;
  previewIndex: number;
  selectedStrategy: DecisionStrategy | null;
  workflowRunHistoryByDecision: Record<string, WorkflowRunStateEntry[]>;
  workflowRunHistoryLoadingByDecision: Record<string, boolean>;
  workflowRunHistoryErrorByDecision: Record<string, string | null>;
}

export function useWorkflowPreviewData({
  result,
  previewIndex,
  selectedStrategy,
  workflowRunHistoryByDecision,
  workflowRunHistoryLoadingByDecision,
  workflowRunHistoryErrorByDecision,
}: UseWorkflowPreviewDataParams) {
  const reportStates = useMemo(() => normalizeWorkflowStates(result), [result]);
  const clampedPreviewIndex = reportStates.length > 0 ? Math.min(previewIndex, reportStates.length - 1) : 0;
  const activeReport = reportStates[clampedPreviewIndex] ?? null;
  const selectedStrategyRunHistory = useMemo(() => {
    if (!selectedStrategy) {
      return [];
    }
    return workflowRunHistoryByDecision[selectedStrategy.id] ?? [];
  }, [selectedStrategy, workflowRunHistoryByDecision]);
  const selectedStrategyRunHistoryCount = selectedStrategyRunHistory.length;
  const isSelectedStrategyRunHistoryLoading = selectedStrategy ? Boolean(workflowRunHistoryLoadingByDecision[selectedStrategy.id]) : false;
  const selectedStrategyRunHistoryError = selectedStrategy ? workflowRunHistoryErrorByDecision[selectedStrategy.id] ?? null : null;
  const activeMetrics = useMemo(() => (activeReport ? extractSnapshotMetrics(activeReport) : null), [activeReport]);
  const activeGovernanceRows = useMemo(() => (activeReport ? extractGovernanceRows(activeReport) : []), [activeReport]);
  const activeReviews = useMemo(() => (activeReport ? sortReviews(activeReport) : []), [activeReport]);
  const activeRecommendation = activeReport ? recommendationForState(activeReport) : null;
  const activeRecommendationTone = activeRecommendation ? recommendationTone(activeRecommendation) : null;
  const blockedReviewCount = activeReviews.filter((review) => review.blocked).length;
  const missingSectionCount = activeReport?.missing_sections.length ?? 0;
  const summaryLine = activeReport ? firstLine(activeReport.synthesis?.executive_summary ?? "") : "";

  return {
    reportStates,
    clampedPreviewIndex,
    activeReport,
    selectedStrategyRunHistory,
    selectedStrategyRunHistoryCount,
    isSelectedStrategyRunHistoryLoading,
    selectedStrategyRunHistoryError,
    activeMetrics,
    activeGovernanceRows,
    activeReviews,
    activeRecommendation,
    activeRecommendationTone,
    blockedReviewCount,
    missingSectionCount,
    summaryLine,
  };
}
