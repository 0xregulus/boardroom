import { useCallback, useEffect, useMemo, useState } from "react";

import type { DecisionStrategy } from "../types";

interface UseSelectedStrategyParams {
  strategies: DecisionStrategy[];
}

interface UseSelectedStrategyResult {
  selectedStrategyId: string | null;
  setSelectedStrategyId: (value: string | null) => void;
  selectedStrategy: DecisionStrategy | null;
  handleStrategySelect: (strategy: DecisionStrategy) => void;
}

export function useSelectedStrategy({
  strategies,
}: UseSelectedStrategyParams): UseSelectedStrategyResult {
  const [selectedStrategyId, setSelectedStrategyId] = useState<string | null>(null);

  const selectedStrategy = useMemo(
    () => strategies.find((strategy) => strategy.id === selectedStrategyId) ?? null,
    [strategies, selectedStrategyId],
  );

  useEffect(() => {
    if (!selectedStrategyId) {
      return;
    }

    const exists = strategies.some((strategy) => strategy.id === selectedStrategyId);
    if (!exists) {
      setSelectedStrategyId(null);
    }
  }, [selectedStrategyId, strategies]);

  const handleStrategySelect = useCallback((strategy: DecisionStrategy): void => {
    setSelectedStrategyId(strategy.id);
  }, []);

  return {
    selectedStrategyId,
    setSelectedStrategyId,
    selectedStrategy,
    handleStrategySelect,
  };
}
