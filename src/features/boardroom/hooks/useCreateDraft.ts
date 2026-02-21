import { useMemo, useState } from "react";

import type {
  CreateStrategyDraft,
  DecisionStrategy,
  DraftCapitalAllocation,
  DraftCoreProperties,
  DraftRiskProperties,
  StrategicMitigationEntry,
} from "../types";
import {
  buildCreateDraftFromStrategy,
  deriveRiskAdjustedRoi,
  deriveRiskAdjustedValue,
  deriveRiskScore,
  deriveWeightedCapitalScore,
  initialCreateStrategyDraft,
} from "../utils";

export function useCreateDraft() {
  const [createDraft, setCreateDraft] = useState<CreateStrategyDraft>(() => initialCreateStrategyDraft());
  const [isCreateReadOnly, setIsCreateReadOnly] = useState(false);
  const [isCoreCollapsed, setIsCoreCollapsed] = useState(false);
  const [isCapitalCollapsed, setIsCapitalCollapsed] = useState(false);
  const [isRiskCollapsed, setIsRiskCollapsed] = useState(false);

  const riskAdjustedValue = useMemo(() => deriveRiskAdjustedValue(createDraft), [createDraft]);
  const riskAdjustedRoi = useMemo(() => deriveRiskAdjustedRoi(createDraft, riskAdjustedValue), [createDraft, riskAdjustedValue]);
  const weightedCapitalScore = useMemo(
    () => deriveWeightedCapitalScore(createDraft, riskAdjustedRoi),
    [createDraft, riskAdjustedRoi],
  );
  const riskScore = useMemo(() => deriveRiskScore(createDraft), [createDraft]);

  function openCreateStrategyForm(): void {
    setCreateDraft(initialCreateStrategyDraft());
    setIsCreateReadOnly(false);
    setIsCoreCollapsed(false);
    setIsCapitalCollapsed(false);
    setIsRiskCollapsed(false);
  }

  function openStrategyDetails(strategy: DecisionStrategy): void {
    setCreateDraft(buildCreateDraftFromStrategy(strategy));
    setIsCreateReadOnly(true);
    setIsCoreCollapsed(false);
    setIsCapitalCollapsed(false);
    setIsRiskCollapsed(false);
  }

  function replaceDraftFromStrategy(strategy: DecisionStrategy): void {
    setCreateDraft(buildCreateDraftFromStrategy(strategy));
  }

  function updateCreateTitle(value: string): void {
    setCreateDraft((prev) => ({ ...prev, name: value }));
  }

  function updateCreateSection(sectionKey: string, value: string): void {
    setCreateDraft((prev) => ({
      ...prev,
      sections: {
        ...prev.sections,
        [sectionKey]: value,
      },
    }));
  }

  function updateCoreProperty(field: keyof DraftCoreProperties, value: string): void {
    setCreateDraft((prev) => ({
      ...prev,
      coreProperties: {
        ...prev.coreProperties,
        [field]: value,
      },
    }));
  }

  function updateCapitalAllocation(field: keyof DraftCapitalAllocation, value: string | number): void {
    setCreateDraft((prev) => ({
      ...prev,
      capitalAllocation: {
        ...prev.capitalAllocation,
        [field]:
          field === "investmentRequired" || field === "grossBenefit12m"
            ? typeof value === "number"
              ? value
              : Number(value) || 0
            : String(value),
      },
    }));
  }

  function updateRiskProperty(field: keyof DraftRiskProperties, value: string): void {
    setCreateDraft((prev) => ({
      ...prev,
      riskProperties: {
        ...prev.riskProperties,
        [field]: value,
      },
    }));
  }

  function upsertMitigation(entry: StrategicMitigationEntry): void {
    setCreateDraft((prev) => {
      const nextEntries = [...prev.mitigations];
      const existingIndex = nextEntries.findIndex((item) => item.id === entry.id);
      if (existingIndex >= 0) {
        nextEntries[existingIndex] = entry;
      } else {
        nextEntries.push(entry);
      }
      return {
        ...prev,
        mitigations: nextEntries,
      };
    });
  }

  function resetCreateDraft(): void {
    setCreateDraft(initialCreateStrategyDraft());
    setIsCreateReadOnly(false);
  }

  function resetCreatePanelState(): void {
    setIsCreateReadOnly(false);
    setIsCoreCollapsed(false);
    setIsCapitalCollapsed(false);
    setIsRiskCollapsed(false);
  }

  return {
    createDraft,
    isCreateReadOnly,
    isCoreCollapsed,
    isCapitalCollapsed,
    isRiskCollapsed,
    riskAdjustedValue,
    riskAdjustedRoi,
    weightedCapitalScore,
    riskScore,
    setCreateDraft,
    setIsCoreCollapsed,
    setIsCapitalCollapsed,
    setIsRiskCollapsed,
    openCreateStrategyForm,
    openStrategyDetails,
    replaceDraftFromStrategy,
    updateCreateTitle,
    updateCreateSection,
    updateCoreProperty,
    updateCapitalAllocation,
    updateRiskProperty,
    upsertMitigation,
    resetCreateDraft,
    resetCreatePanelState,
  };
}
