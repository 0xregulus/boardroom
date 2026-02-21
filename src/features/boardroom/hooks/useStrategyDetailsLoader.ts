import { useCallback, useState } from "react";

import type { DecisionStrategy, StrategyDetailsResponse } from "../types";

interface UseStrategyDetailsLoaderParams {
  selectedStrategy: DecisionStrategy | null;
  openCreateStage: () => void;
  setDecisionId: (value: string) => void;
  openStrategyDetails: (strategy: DecisionStrategy) => void;
  replaceDraftFromStrategy: (strategy: DecisionStrategy) => void;
  upsertStrategy: (strategy: DecisionStrategy) => void;
}

interface UseStrategyDetailsLoaderResult {
  isLoadingStrategyDetails: boolean;
  openSelectedStrategyDetails: () => void;
  openStrategyDetailsFor: (strategy: DecisionStrategy) => void;
  resetStrategyDetailsLoading: () => void;
}

export function useStrategyDetailsLoader({
  selectedStrategy,
  openCreateStage,
  setDecisionId,
  openStrategyDetails,
  replaceDraftFromStrategy,
  upsertStrategy,
}: UseStrategyDetailsLoaderParams): UseStrategyDetailsLoaderResult {
  const [isLoadingStrategyDetails, setIsLoadingStrategyDetails] = useState(false);

  const openStrategyDetailsFor = useCallback((strategy: DecisionStrategy): void => {
    if (isLoadingStrategyDetails) {
      return;
    }

    const selectedAtClick = strategy;
    const selectedId = selectedAtClick.id;

    openStrategyDetails(selectedAtClick);
    setDecisionId(selectedId);
    openCreateStage();
    setIsLoadingStrategyDetails(true);

    void (async () => {
      try {
        const response = await fetch(`/api/strategies/${encodeURIComponent(selectedId)}?includeSensitive=true`);
        const json = (await response.json()) as StrategyDetailsResponse;
        if (!response.ok || !json.strategy) {
          return;
        }

        if (json.strategy.id !== selectedId) {
          return;
        }

        upsertStrategy(json.strategy);
        replaceDraftFromStrategy(json.strategy);
      } catch {
        // Keep current draft data if enrichment fails.
      } finally {
        setIsLoadingStrategyDetails(false);
      }
    })();
  }, [
    isLoadingStrategyDetails,
    openCreateStage,
    openStrategyDetails,
    replaceDraftFromStrategy,
    setDecisionId,
    upsertStrategy,
  ]);

  const openSelectedStrategyDetails = useCallback((): void => {
    if (!selectedStrategy) {
      return;
    }
    openStrategyDetailsFor(selectedStrategy);
  }, [openStrategyDetailsFor, selectedStrategy]);

  const resetStrategyDetailsLoading = useCallback(() => {
    setIsLoadingStrategyDetails(false);
  }, []);

  return {
    isLoadingStrategyDetails,
    openSelectedStrategyDetails,
    openStrategyDetailsFor,
    resetStrategyDetailsLoading,
  };
}
