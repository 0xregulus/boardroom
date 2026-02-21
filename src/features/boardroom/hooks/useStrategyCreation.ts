import { useCallback } from "react";

import { CURRENCY_FORMATTER } from "../constants";
import type { CreateStrategyDraft, DecisionStrategy } from "../types";

interface UseStrategyCreationParams {
  createDraft: CreateStrategyDraft;
  onCreated: (strategy: DecisionStrategy) => void;
  onResetDraft: () => void;
  onComplete: () => void;
}

interface UseStrategyCreationResult {
  saveCreatedStrategy: () => Promise<void>;
}

interface StrategySaveResponse {
  strategy?: DecisionStrategy;
  error?: string;
  details?: string;
}

export function useStrategyCreation({
  createDraft,
  onCreated,
  onResetDraft,
  onComplete,
}: UseStrategyCreationParams): UseStrategyCreationResult {
  const saveCreatedStrategy = useCallback(async () => {
    const strategyName = createDraft.name.trim().length > 0 ? createDraft.name.trim() : "Untitled Strategic Decision";
    const strategyOwner = createDraft.owner.trim().length > 0 ? createDraft.owner.trim() : "Unassigned";
    const parsedReviewDate = createDraft.reviewDate.trim().length > 0 ? new Date(createDraft.reviewDate) : null;
    const strategyReviewDate =
      parsedReviewDate && !Number.isNaN(parsedReviewDate.getTime())
        ? parsedReviewDate.toLocaleDateString("en-US", {
          month: "short",
          day: "2-digit",
          year: "numeric",
        })
        : "No review date";

    const sectionSummary = createDraft.sections.executiveSummary?.trim() ?? "";
    const strategyPrimaryKpi =
      createDraft.coreProperties.primaryKpi.trim().length > 0
        ? createDraft.coreProperties.primaryKpi.trim()
        : createDraft.primaryKpi.trim().length > 0
          ? createDraft.primaryKpi.trim()
          : "Not specified";
    const strategyObjective =
      createDraft.coreProperties.strategicObjective.trim().length > 0
        ? createDraft.coreProperties.strategicObjective.trim()
        : createDraft.strategicObjective.trim().length > 0
          ? createDraft.strategicObjective.trim()
          : "Not specified";
    const strategyInvestment =
      createDraft.capitalAllocation.investmentRequired > 0
        ? CURRENCY_FORMATTER.format(createDraft.capitalAllocation.investmentRequired)
        : createDraft.investment.trim().length > 0
          ? createDraft.investment.trim()
          : "N/A";
    const strategyConfidence =
      createDraft.capitalAllocation.probabilityOfSuccess.trim().length > 0
        ? createDraft.capitalAllocation.probabilityOfSuccess.trim()
        : createDraft.confidence.trim().length > 0
          ? createDraft.confidence.trim()
          : "N/A";
    const generatedId = Math.random().toString(16).slice(2, 10);
    const artifactSections: Record<string, string> = {
      ...createDraft.sections,
      coreProperties: JSON.stringify(createDraft.coreProperties),
      capitalAllocationModel: JSON.stringify(createDraft.capitalAllocation),
      riskProperties: JSON.stringify(createDraft.riskProperties),
      mitigations: JSON.stringify(createDraft.mitigations),
    };

    const createdStrategy: DecisionStrategy = {
      id: generatedId,
      name: strategyName,
      status: "Proposed",
      owner: strategyOwner,
      reviewDate: strategyReviewDate,
      summary: sectionSummary.length > 0 ? sectionSummary : "Strategic decision artifact draft created from template.",
      primaryKpi: strategyPrimaryKpi,
      investment: strategyInvestment,
      strategicObjective: strategyObjective,
      confidence: strategyConfidence,
      artifactSections,
    };

    let persistedStrategy = createdStrategy;

    try {
      const response = await fetch("/api/strategies?includeSensitive=true", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          strategy: createdStrategy,
        }),
      });
      const payload = (await response.json()) as StrategySaveResponse;
      if (!response.ok) {
        throw new Error(payload.details || payload.error || "Failed to persist strategic decision.");
      }
      if (payload.strategy) {
        persistedStrategy = {
          ...payload.strategy,
          artifactSections: createdStrategy.artifactSections,
        };
      }
    } catch (error) {
      console.warn("[useStrategyCreation] persisting strategy failed, continuing with local draft", error);
    }

    onCreated(persistedStrategy);
    onResetDraft();
    onComplete();
  }, [createDraft, onComplete, onCreated, onResetDraft]);

  return {
    saveCreatedStrategy,
  };
}
