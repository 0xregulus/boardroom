import { useEffect, useMemo, useState } from "react";

import {
  type AgentConfig,
  type LLMProvider,
  buildCustomAgentConfig,
  buildDefaultAgentConfigs,
  normalizeAgentConfigs,
  resolveModelForProvider,
} from "../../../config/agent_config";
import { CORE_AGENT_IDS } from "../constants";
import type { AgentConfigSyncStatus } from "../types";
import { serializeAgentConfigs } from "../utils";

export function useAgentConfigs() {
  const [agentConfigs, setAgentConfigs] = useState<AgentConfig[]>(() => buildDefaultAgentConfigs());
  const [selectedAgentId, setSelectedAgentId] = useState<string>("ceo");
  const [syncStatus, setSyncStatus] = useState<AgentConfigSyncStatus>("loading");
  const [syncMessage, setSyncMessage] = useState("Loading from database...");
  const [lastPersistedJson, setLastPersistedJson] = useState(() =>
    serializeAgentConfigs(buildDefaultAgentConfigs()),
  );

  const normalizedConfigs = useMemo(() => normalizeAgentConfigs(agentConfigs), [agentConfigs]);
  const currentSnapshot = useMemo(() => serializeAgentConfigs(normalizedConfigs), [normalizedConfigs]);
  const isDirty = useMemo(
    () => currentSnapshot !== lastPersistedJson,
    [currentSnapshot, lastPersistedJson],
  );

  const selectedAgentConfig = useMemo(
    () => normalizedConfigs.find((config) => config.id === selectedAgentId) ?? normalizedConfigs[0] ?? null,
    [normalizedConfigs, selectedAgentId],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadConfigs() {
      setSyncStatus("loading");
      setSyncMessage("Loading from database...");

      try {
        const response = await fetch("/api/agent-configs?includeSensitive=true");
        const json = await response.json();

        if (!response.ok) {
          throw new Error(json.details || json.error || "Failed to load agent configurations.");
        }

        if (cancelled) {
          return;
        }

        const normalized = normalizeAgentConfigs(json.agentConfigs);
        setAgentConfigs(normalized);
        setLastPersistedJson(serializeAgentConfigs(normalized));
        setSyncStatus("saved");
        setSyncMessage(json.persisted ? "Loaded from database." : "Using default configuration.");
      } catch (error) {
        if (cancelled) {
          return;
        }

        setSyncStatus("error");
        setSyncMessage(error instanceof Error ? error.message : String(error));
      }
    }

    loadConfigs();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (syncStatus === "loading" || syncStatus === "saving" || syncStatus === "error") {
      return;
    }

    if (isDirty && syncStatus !== "dirty") {
      setSyncStatus("dirty");
      setSyncMessage("Unsaved changes.");
    } else if (!isDirty && syncStatus === "dirty") {
      setSyncStatus("saved");
      setSyncMessage("All changes saved.");
    }
  }, [isDirty, syncStatus]);

  useEffect(() => {
    const exists = normalizedConfigs.some((config) => config.id === selectedAgentId);
    if (!exists) {
      setSelectedAgentId(normalizedConfigs[0]?.id ?? "ceo");
    }
  }, [normalizedConfigs, selectedAgentId]);

  function updateAgentConfig(agentId: string, updater: (current: AgentConfig) => AgentConfig): void {
    setAgentConfigs((prev) => {
      const current = normalizeAgentConfigs(prev);
      return current.map((config) => (config.id === agentId ? updater(config) : config));
    });
  }

  function updateAgentField<K extends keyof AgentConfig>(agentId: string, field: K, value: AgentConfig[K]): void {
    updateAgentConfig(agentId, (current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateProvider(agentId: string, provider: LLMProvider): void {
    updateAgentConfig(agentId, (current) => ({
      ...current,
      provider,
      model: resolveModelForProvider(provider, current.model),
    }));
  }

  function addCustomReviewAgent(): void {
    const customAgent = buildCustomAgentConfig(normalizedConfigs);
    setAgentConfigs(normalizeAgentConfigs([...normalizedConfigs, customAgent]));
    setSelectedAgentId(customAgent.id);
  }

  function removeAgentById(agentId: string): void {
    if (CORE_AGENT_IDS.has(agentId)) {
      return;
    }

    const nextConfigs = normalizedConfigs.filter((config) => config.id !== agentId);
    if (nextConfigs.length === 0) {
      return;
    }

    setAgentConfigs(nextConfigs);
    setSelectedAgentId((current) => (current === agentId ? nextConfigs[0]?.id ?? "ceo" : current));
  }

  async function saveConfigs() {
    if (syncStatus === "loading" || syncStatus === "saving") {
      return;
    }

    setSyncStatus("saving");
    setSyncMessage("Saving to database...");

    try {
      const response = await fetch("/api/agent-configs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentConfigs: normalizedConfigs }),
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.details || json.error || "Failed to persist agent configurations.");
      }

      setLastPersistedJson(currentSnapshot);
      setSyncStatus("saved");
      setSyncMessage(`Saved at ${new Date().toLocaleTimeString([], { hour12: false })}.`);
    } catch (error) {
      setSyncStatus("error");
      setSyncMessage(error instanceof Error ? error.message : String(error));
    }
  }

  function resetConfigs() {
    const defaults = buildDefaultAgentConfigs();
    setAgentConfigs(defaults);
    setSelectedAgentId(defaults[0]?.id ?? "ceo");
    setSyncStatus("dirty");
    setSyncMessage("Unsaved changes.");
  }

  return {
    agentConfigs: normalizedConfigs,
    selectedAgentId,
    selectedAgentConfig,
    setSelectedAgentId,
    syncStatus,
    syncMessage,
    saveConfigs,
    resetConfigs,
    isDirty,
    updateAgentField,
    updateProvider,
    addCustomReviewAgent,
    removeAgentById,
  };
}
