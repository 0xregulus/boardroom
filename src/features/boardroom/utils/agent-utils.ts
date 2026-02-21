import type { AgentConfig, LLMProvider } from "../../../config/agent_config";
import { normalizeAgentConfigs } from "../../../config/agent_config";
import { CORE_AGENT_IDS } from "../constants";
import type { ChessPiece } from "../types";

export function serializeAgentConfigs(configs: AgentConfig[]): string {
  return JSON.stringify(normalizeAgentConfigs(configs));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function resolveAgentChessPiece(agentId: string, role: string): ChessPiece {
  const normalizedId = agentId.trim().toLowerCase();
  if (normalizedId === "ceo") {
    return "king";
  }
  if (normalizedId === "cfo") {
    return "bishop";
  }
  if (normalizedId === "cto") {
    return "knight";
  }
  if (normalizedId === "compliance") {
    return "rook";
  }
  if (normalizedId.length > 0 && !CORE_AGENT_IDS.has(normalizedId)) {
    return "pawn";
  }

  const normalizedRole = role.trim().toLowerCase();
  if (normalizedRole.includes("ceo") || normalizedRole.includes("chief executive")) {
    return "king";
  }
  if (normalizedRole.includes("cfo") || normalizedRole.includes("chief financial")) {
    return "bishop";
  }
  if (normalizedRole.includes("cto") || normalizedRole.includes("chief technology")) {
    return "knight";
  }
  if (normalizedRole.includes("compliance")) {
    return "rook";
  }

  return "pawn";
}

export function agentModelMeta(provider: LLMProvider, model: string): string {
  return `${String(provider).toUpperCase()} • ${model.toUpperCase()}`;
}
