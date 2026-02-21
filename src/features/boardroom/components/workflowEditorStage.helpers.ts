import type { NodeStatus, WorkflowTask } from "../types";

export interface AgentOutcome {
  label: string;
  tone: "idle" | "running" | "approved" | "challenged" | "blocked";
}

export interface OrbitAgentView {
  id: string;
  orbitIndex: number;
  title: string;
  domain: string;
  subtitle: string;
  status: NodeStatus;
  outcome: AgentOutcome;
  researchActive: boolean;
  x: number;
  y: number;
  pullStrength: number;
  roundPhase: number;
  roundIntensity: number;
  streamInfluence: number;
}

export const STAGE_FLOW: ReadonlyArray<{ id: string; title: string; subtitle: string }> = [
  { id: "1", title: "Strategic Context", subtitle: "Input brief" },
  { id: "2", title: "Drafting Doc", subtitle: "Draft synthesis" },
  { id: "3", title: "Parallel Reviewers", subtitle: "Executive orbit" },
  { id: "4", title: "Cross-Agent Rebuttal", subtitle: "Debate rounds" },
  { id: "5", title: "Feedback Synthesis", subtitle: "DQS composition" },
  { id: "6", title: "Generate PRD", subtitle: "Artifact output" },
  { id: "7", title: "DB Persist", subtitle: "State + memory" },
];

export const REVIEWER_SPECS: ReadonlyArray<{ title: string; subtitle: string; requiresRedTeam?: boolean }> = [
  { title: "CEO", subtitle: "Strategic viability" },
  { title: "CFO", subtitle: "Financial integrity" },
  { title: "CTO", subtitle: "Technical feasibility" },
  { title: "Compliance", subtitle: "Legal & governance" },
  { title: "Pre-Mortem", subtitle: "Failure-chain stress test", requiresRedTeam: true },
  { title: "Risk Agent", subtitle: "Monte Carlo downside envelope", requiresRedTeam: true },
  { title: "Resource Competitor", subtitle: "Competing allocation pressure", requiresRedTeam: true },
  { title: "Devil's Advocate", subtitle: "No-go case pressure test", requiresRedTeam: true },
];

export const REBUTTAL_ROUND_OPTIONS: readonly number[] = [1, 2, 3, 4, 5];
export const REFINEMENT_RING_LEVELS: readonly number[] = [1, 2, 3, 4, 5];
export const PULSE_MAX_AGENTS = 12;
export const ORBIT_VIEWBOX_WIDTH = 900;
export const ORBIT_VIEWBOX_HEIGHT = 620;
export const ORBIT_CENTER_X = 450;
export const ORBIT_CENTER_Y = 300;
export const ORBIT_AGENT_RADIUS = 336;
export const ORBIT_CENTER_LEFT = "50%";
export const ORBIT_CENTER_TOP = "64%";

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function domainForAgent(title: string): string {
  const normalized = title.toLowerCase();
  if (normalized.includes("cfo") || normalized.includes("finance")) {
    return "Finance";
  }
  if (normalized.includes("cto") || normalized.includes("tech")) {
    return "Technology";
  }
  if (normalized.includes("compliance")) {
    return "Compliance";
  }
  if (normalized.includes("pre-mortem")) {
    return "Risk";
  }
  if (normalized.includes("risk agent")) {
    return "Risk";
  }
  if (normalized.includes("devil")) {
    return "Risk";
  }
  if (normalized.includes("competitor")) {
    return "Strategy";
  }
  return "Strategy";
}

export function outcomeForAgent(status: NodeStatus, title: string, disabled = false): AgentOutcome {
  if (disabled) {
    return { label: "Disabled", tone: "idle" };
  }
  if (status === "FAILED") {
    return { label: "Blocked", tone: "blocked" };
  }
  if (status === "RUNNING") {
    return { label: "Reviewing", tone: "running" };
  }
  if (status === "COMPLETED") {
    if (
      title === "Pre-Mortem" ||
      title === "Compliance" ||
      title === "Resource Competitor" ||
      title === "Risk Agent" ||
      title === "Devil's Advocate"
    ) {
      return { label: "Challenged", tone: "challenged" };
    }
    return { label: "Approved", tone: "approved" };
  }
  return { label: "Queued", tone: "idle" };
}

export function influenceFromAgent(agent: OrbitAgentView | undefined): number {
  if (!agent || agent.outcome.label === "Disabled") {
    return 0;
  }

  if (agent.outcome.tone === "blocked") {
    return 1;
  }
  if (agent.outcome.tone === "challenged") {
    return 0.92;
  }
  if (agent.status === "RUNNING") {
    return 0.9;
  }
  return 0;
}

export function splitLogLine(line: string): { timestamp: string | null; message: string } {
  const match = line.match(/^(\d{1,2}:\d{2}:\d{2})\s{2,}(.*)$/);
  if (!match) {
    return { timestamp: null, message: line };
  }
  return { timestamp: match[1], message: match[2] };
}

export function extractTraceTag(message: string): { tag: string | null; message: string } {
  const explicitMatch = message.match(/^(WARN|ERROR|EXEC)\s+(.+)$/i);
  if (!explicitMatch) {
    return { tag: null, message };
  }

  return {
    tag: explicitMatch[1]!.toUpperCase(),
    message: explicitMatch[2]!.trim(),
  };
}

export function deriveActiveRebuttalRound(logLines: string[], configuredRounds: number, isRunning: boolean): number {
  if (configuredRounds <= 0) {
    return 0;
  }

  let rebuttalStarted = false;
  let highestCompleted = 0;

  for (const line of logLines) {
    if (/cross-agent rebuttal/i.test(line)) {
      rebuttalStarted = true;
    }

    const completedMatch = line.match(/round\s+(\d+)\s+rebuttal completed/i);
    if (completedMatch) {
      const round = Number.parseInt(completedMatch[1] ?? "0", 10);
      if (Number.isFinite(round)) {
        highestCompleted = Math.max(highestCompleted, round);
      }
    }
  }

  if (!rebuttalStarted) {
    return 0;
  }

  if (isRunning) {
    return Math.min(configuredRounds, Math.max(1, highestCompleted + 1));
  }

  return Math.min(configuredRounds, Math.max(1, highestCompleted));
}

export function buildTaskIndex(tasks: WorkflowTask[] = []): Map<string, WorkflowTask> {
  const index = new Map<string, WorkflowTask>();
  for (const task of tasks) {
    index.set(normalizeKey(task.title), task);
  }
  return index;
}
