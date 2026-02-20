import { useMemo } from "react";
import dynamic from "next/dynamic";

import type { DecisionStrategy, NodeStatus, WorkflowNode, WorkflowTask } from "../types";

interface WorkflowEditorStageProps {
  selectedStrategy: DecisionStrategy | null;
  includeExternalResearch: boolean;
  includeRedTeamPersonas: boolean;
  interactionRounds: number;
  tavilyConfigured: boolean;
  nodes: WorkflowNode[];
  selectedNode: WorkflowNode | null;
  selectedNodeId: string | null;
  expandedNodeId: string | null;
  logLines: string[];
  isRunning: boolean;
  runLabel: string;
  error: string | null;
  onBack: () => void;
  onRun: () => void;
  onNodeClick: (node: WorkflowNode) => void;
  onIncludeExternalResearchChange: (checked: boolean) => void;
  onIncludeRedTeamPersonasChange: (checked: boolean) => void;
  onInteractionRoundsChange: (rounds: number) => void;
}

interface AgentOutcome {
  label: string;
  tone: "idle" | "running" | "approved" | "challenged" | "blocked";
}

interface OrbitAgentView {
  id: string;
  title: string;
  domain: string;
  subtitle: string;
  status: NodeStatus;
  outcome: AgentOutcome;
  tavilyActive: boolean;
  x: number;
  y: number;
  pullStrength: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function domainForAgent(title: string): string {
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
  if (normalized.includes("competitor")) {
    return "Strategy";
  }
  return "Strategy";
}

function outcomeForAgent(status: NodeStatus, title: string, disabled = false): AgentOutcome {
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
    if (title === "Pre-Mortem" || title === "Compliance" || title === "Resource Competitor") {
      return { label: "Challenged", tone: "challenged" };
    }
    return { label: "Approved", tone: "approved" };
  }
  return { label: "Queued", tone: "idle" };
}

function influenceFromAgent(agent: OrbitAgentView | undefined): number {
  if (!agent || agent.outcome.label === "Disabled") {
    return 0;
  }

  if (agent.outcome.tone === "blocked") {
    return 0.95;
  }
  if (agent.outcome.tone === "challenged") {
    return 0.9;
  }
  if (agent.status === "RUNNING") {
    return 0.2;
  }
  return 0;
}

function splitLogLine(line: string): { timestamp: string | null; message: string } {
  const match = line.match(/^(\d{1,2}:\d{2}:\d{2})\s{2,}(.*)$/);
  if (!match) {
    return { timestamp: null, message: line };
  }
  return { timestamp: match[1], message: match[2] };
}

const STAGE_FLOW: ReadonlyArray<{ id: string; title: string; subtitle: string }> = [
  { id: "1", title: "Strategic Context", subtitle: "Input brief" },
  { id: "2", title: "Drafting Doc", subtitle: "Draft synthesis" },
  { id: "3", title: "Parallel Reviewers", subtitle: "Executive orbit" },
  { id: "4", title: "Cross-Agent Rebuttal", subtitle: "Debate rounds" },
  { id: "5", title: "Feedback Synthesis", subtitle: "DQS composition" },
  { id: "6", title: "Generate PRD", subtitle: "Artifact output" },
  { id: "7", title: "DB Persist", subtitle: "State + memory" },
];

const REVIEWER_SPECS: ReadonlyArray<{ title: string; subtitle: string; requiresRedTeam?: boolean }> = [
  { title: "CEO", subtitle: "Strategic viability" },
  { title: "CFO", subtitle: "Financial integrity" },
  { title: "CTO", subtitle: "Technical feasibility" },
  { title: "Compliance", subtitle: "Legal & governance" },
  { title: "Pre-Mortem", subtitle: "Failure-chain stress test", requiresRedTeam: true },
  { title: "Resource Competitor", subtitle: "Competing allocation pressure", requiresRedTeam: true },
];

const REBUTTAL_ROUND_OPTIONS: readonly number[] = [1, 2, 3, 4, 5];
const REFINEMENT_RING_LEVELS: readonly number[] = [1, 2, 3, 4, 5];
const ORBIT_CENTER_X = 450;
const ORBIT_CENTER_Y = 300;
const ORBIT_CENTER_LEFT = "50%";
const ORBIT_CENTER_TOP = "64%";
const DecisionPulse3D = dynamic(
  () => import("./DecisionPulse3D").then((module) => module.DecisionPulse3D),
  { ssr: false },
);

export function WorkflowEditorStage({
  includeExternalResearch,
  includeRedTeamPersonas,
  interactionRounds,
  tavilyConfigured,
  nodes,
  selectedNode,
  selectedNodeId,
  logLines,
  isRunning,
  onNodeClick,
  onIncludeExternalResearchChange,
  onIncludeRedTeamPersonasChange,
  onInteractionRoundsChange,
}: WorkflowEditorStageProps) {
  const nodeIndex = useMemo(() => new Map(nodes.map((node) => [node.id, node] as const)), [nodes]);

  const stageSteps = useMemo(
    () =>
      STAGE_FLOW.map((step) => {
        const source = nodeIndex.get(step.id);
        return {
          id: step.id,
          title: step.title,
          subtitle: source?.subtitle ?? step.subtitle,
          status: source?.status ?? "IDLE",
        };
      }),
    [nodeIndex],
  );

  const orbitAgents = useMemo<OrbitAgentView[]>(() => {
    const reviewNode = nodeIndex.get("3");
    const taskIndex = new Map<string, WorkflowTask>();
    for (const task of reviewNode?.tasks ?? []) {
      taskIndex.set(normalizeKey(task.title), task);
    }

    const specByKey = new Map(REVIEWER_SPECS.map((spec) => [normalizeKey(spec.title), spec] as const));
    const renderedReviewers: Array<{ title: string; subtitle: string; requiresRedTeam?: boolean }> = [];
    const seen = new Set<string>();

    // Keep known reviewers in stable order when configured and always show red-team personas.
    for (const spec of REVIEWER_SPECS) {
      const key = normalizeKey(spec.title);
      const isInTasks = taskIndex.has(key);
      if (isInTasks || spec.requiresRedTeam) {
        renderedReviewers.push(spec);
        seen.add(key);
      }
    }

    // Append custom reviewers created by users.
    for (const task of reviewNode?.tasks ?? []) {
      const key = normalizeKey(task.title);
      if (seen.has(key)) {
        continue;
      }
      const knownSpec = specByKey.get(key);
      renderedReviewers.push({
        title: task.title,
        subtitle: knownSpec?.subtitle ?? `${domainForAgent(task.title)} review`,
        requiresRedTeam: knownSpec?.requiresRedTeam,
      });
      seen.add(key);
    }

    if (renderedReviewers.length === 0) {
      return [];
    }

    const centerX = ORBIT_CENTER_X;
    const centerY = ORBIT_CENTER_Y;
    const radius = 266;
    const slotCount = renderedReviewers.length;
    const angleStep = (Math.PI * 2) / slotCount;

    return renderedReviewers.map((reviewer, index) => {
      const task = taskIndex.get(normalizeKey(reviewer.title));
      const disabled = Boolean(reviewer.requiresRedTeam) && !includeRedTeamPersonas;
      const status = disabled ? "IDLE" : task?.status ?? "IDLE";
      const outcome = outcomeForAgent(status, reviewer.title, disabled);
      const angle = -Math.PI / 2 + index * angleStep;
      const pullStrength =
        status === "RUNNING"
          ? 34
          : outcome.tone === "challenged"
            ? 20
            : outcome.tone === "blocked"
              ? 14
              : 0;
      const dynamicRadius = Math.max(208, radius - pullStrength);
      const x = centerX + Math.cos(angle) * dynamicRadius;
      const y = centerY + Math.sin(angle) * dynamicRadius;

      return {
        id: reviewer.title,
        title: reviewer.title,
        domain: domainForAgent(reviewer.title),
        subtitle: reviewer.subtitle,
        status,
        outcome,
        tavilyActive: Boolean(includeExternalResearch) && status === "RUNNING",
        x,
        y,
        pullStrength,
      };
    });
  }, [includeExternalResearch, includeRedTeamPersonas, nodeIndex]);

  const executionSnapshot = useMemo(() => {
    const total = stageSteps.length;
    const completed = stageSteps.filter((step) => step.status === "COMPLETED").length;
    const running = stageSteps.filter((step) => step.status === "RUNNING").length;
    const failed = stageSteps.filter((step) => step.status === "FAILED").length;

    const challenged = orbitAgents.filter((agent) => agent.outcome.tone === "challenged").length;
    const approved = orbitAgents.filter((agent) => agent.outcome.tone === "approved").length;

    const progress = clamp01((completed + running * 0.6) / Math.max(1, total));
    const substance = Math.round(58 + progress * 36 + approved * 1.4 - challenged * 1.2);
    const hygiene = Math.round(61 + progress * 30 - challenged * 3.5 - failed * 8);

    const state =
      failed > 0
        ? "Blocked"
        : challenged > 0 && (completed > 0 || running > 0)
          ? "Challenged"
          : completed === total
            ? "Approved"
            : running > 0
              ? "In Review"
              : "Pending";

    return {
      progress,
      substance: Math.max(0, Math.min(100, substance)),
      hygiene: Math.max(0, Math.min(100, hygiene)),
      state,
    };
  }, [orbitAgents, stageSteps]);

  const pulseDqs = useMemo(
    () => Number((executionSnapshot.substance * 0.75 + executionSnapshot.hygiene * 0.25).toFixed(1)),
    [executionSnapshot.hygiene, executionSnapshot.substance],
  );

  const pulseAgentInfluence = useMemo(() => {
    const index = new Map(orbitAgents.map((agent) => [normalizeKey(agent.title), agent] as const));
    return [
      influenceFromAgent(index.get("ceo")),
      influenceFromAgent(index.get("cfo")),
      influenceFromAgent(index.get("cto")),
      influenceFromAgent(index.get("compliance")),
      influenceFromAgent(index.get("pre-mortem")),
      influenceFromAgent(index.get("resource-competitor")),
    ];
  }, [orbitAgents]);

  const parsedLogLines = useMemo(() => logLines.map(splitLogLine), [logLines]);

  const refinementFeed = useMemo(() => {
    if (parsedLogLines.length === 0) {
      return [];
    }

    return parsedLogLines.slice(-10).map((entry, index) => {
      const lineNo = String(index + 1).padStart(2, "0");
      const tag = entry.message.toLowerCase().includes("review")
        ? "REVIEW"
        : entry.message.toLowerCase().includes("rebuttal")
          ? "DEBATE"
          : entry.message.toLowerCase().includes("synthesis")
            ? "SYNC"
            : "EXEC";
      return {
        id: `${lineNo}-${entry.message}`,
        tag,
        timestamp: entry.timestamp ?? "--:--:--",
        message: entry.message,
      };
    });
  }, [parsedLogLines]);

  const tavilyEvidence = useMemo(() => {
    if (!includeExternalResearch) {
      return [];
    }

    const activeResearchers = orbitAgents.filter((agent) => agent.tavilyActive);
    if (activeResearchers.length > 0) {
      return activeResearchers.map((agent) => ({
        id: `live-${agent.id}`,
        source: `${agent.domain.toUpperCase()} AGENT`,
        note: `${agent.title} scanning web sources for counter-evidence.`,
      }));
    }

    return orbitAgents
      .filter((agent) => agent.outcome.tone === "approved" || agent.outcome.tone === "challenged")
      .slice(0, 3)
      .map((agent, index) => ({
        id: `evidence-${agent.id}`,
        source: `${agent.domain.toUpperCase()} ${index + 1}`,
        note: `${agent.title} validated external benchmark assumptions.`,
      }));
  }, [includeExternalResearch, orbitAgents]);

  const executionTraceEntries = useMemo(() => {
    const refinementEntries = refinementFeed.map((entry) => ({
      id: `ref-${entry.id}`,
      timestamp: entry.timestamp === "--:--:--" ? null : entry.timestamp,
      tag: entry.tag,
      message: entry.message,
    }));

    const tavilyEntries = tavilyEvidence.map((entry) => ({
      id: `tavily-${entry.id}`,
      timestamp: null,
      tag: "TAVILY",
      message: `${entry.source}: ${entry.note}`,
    }));

    return [...refinementEntries, ...tavilyEntries].slice(-14);
  }, [refinementFeed, tavilyEvidence]);

  const pulseStateClass = executionSnapshot.state.toLowerCase().replace(/\s+/g, "-");
  const selectedStep = selectedNode ?? nodeIndex.get(selectedNodeId ?? "") ?? stageSteps[0] ?? null;

  return (
    <section className="pipeline-settings-shell boardroom-pulse-shell" aria-label="Workflow editor">
      <section className="workflow-runtime-preview boardroom-pulse-preview" aria-label="Workflow execution monitor">
        <div className="workflow-runtime-layout boardroom-pulse-layout">
          <div className="boardroom-canvas">
            <div className="canvas-inner boardroom-pulse-canvas-inner">
              <div className="canvas-corner-overlays">
                {includeExternalResearch ? (
                  <span className="tavily-chip canvas-research-chip">
                    <svg viewBox="0 0 16 16" aria-hidden="true" className="research-chip-icon">
                      <circle cx="8" cy="8" r="6" />
                      <path d="M2 8h12" />
                      <path d="M8 2c1.8 1.8 1.8 10.2 0 12" />
                      <path d="M8 2c-1.8 1.8-1.8 10.2 0 12" />
                    </svg>
                    Research
                  </span>
                ) : null}

              </div>

              <section className="pulse-visual-grid">
                <section className="decision-pulse-zone">
                  <header>
                    <div className="decision-pulse-header-copy">
                      <h2>Decision Pulse</h2>
                      <div className="pulse-metric-gauges" role="group" aria-label="Substance and Hygiene gauges">
                        <div className="pulse-metric-row">
                          <div className="pulse-metric-label">
                            <span>Substance</span>
                            <strong>{executionSnapshot.substance}</strong>
                          </div>
                          <div className="pulse-metric-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={executionSnapshot.substance}>
                            <span className="pulse-metric-fill substance" style={{ width: `${executionSnapshot.substance}%` }} />
                          </div>
                        </div>
                        <div className="pulse-metric-row">
                          <div className="pulse-metric-label">
                            <span>Hygiene</span>
                            <strong>{executionSnapshot.hygiene}</strong>
                          </div>
                          <div className="pulse-metric-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={executionSnapshot.hygiene}>
                            <span className="pulse-metric-fill hygiene" style={{ width: `${executionSnapshot.hygiene}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>
                    <strong className={`pulse-state state-${pulseStateClass}`}>{executionSnapshot.state}</strong>
                  </header>

                  <div className="orbit-stage">
                    <svg className="pulse-ring-svg" viewBox="0 0 900 620" aria-hidden="true">
                      <defs>
                        <radialGradient id="pulse-core-fill" cx="50%" cy="45%" r="58%">
                          <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.9" />
                          <stop offset="40%" stopColor="#7c3aed" stopOpacity="0.82" />
                          <stop offset="78%" stopColor="#ec4899" stopOpacity="0.72" />
                          <stop offset="100%" stopColor="#fb923c" stopOpacity="0.65" />
                        </radialGradient>
                      </defs>
                      {REFINEMENT_RING_LEVELS.map((round) => (
                        <circle
                          key={`ring-${round}`}
                          cx={ORBIT_CENTER_X}
                          cy={ORBIT_CENTER_Y}
                          r={108 + round * 28}
                          className={`refinement-ring${interactionRounds >= round ? " active" : ""}`}
                          style={interactionRounds >= round ? { animationDelay: `${round * 220}ms` } : undefined}
                        />
                      ))}
                      <circle cx={ORBIT_CENTER_X} cy={ORBIT_CENTER_Y} r="236" className="pulse-orbit-ring" />
                      {orbitAgents.map((agent) => (
                        <line
                          key={`link-${agent.id}`}
                          x1={ORBIT_CENTER_X}
                          y1={ORBIT_CENTER_Y}
                          x2={agent.x}
                          y2={agent.y}
                          className={`pulse-agent-link tone-${agent.outcome.tone}${agent.status === "RUNNING" ? " active" : ""}`}
                        />
                      ))}
                      {REFINEMENT_RING_LEVELS.map((round) => (
                        <text
                          key={`ring-label-${round}`}
                          x={ORBIT_CENTER_X + 108 + round * 28 + 8}
                          y={ORBIT_CENTER_Y - 4}
                          className={`refinement-ring-label${interactionRounds >= round ? " active" : ""}`}
                        >
                          R{round}
                        </text>
                      ))}
                      {orbitAgents.map((agent) => (
                        <circle key={`dot-${agent.id}`} cx={agent.x} cy={agent.y} r="4.5" className="pulse-orbit-dot" />
                      ))}
                    </svg>

                    <div className="pulse-core-three-wrapper" style={{ left: ORBIT_CENTER_LEFT, top: ORBIT_CENTER_TOP }}>
                      <DecisionPulse3D dqs={pulseDqs} agentInfluence={pulseAgentInfluence} />
                    </div>

                    {orbitAgents.map((agent) => (
                      <button
                        key={agent.id}
                        type="button"
                        className={`orbit-agent tone-${agent.outcome.tone}${selectedStep?.id === "3" ? " selected" : ""}`}
                        style={{ left: `${agent.x}px`, top: `${agent.y}px` }}
                        onClick={() => {
                          const reviewNode = nodeIndex.get("3");
                          if (reviewNode) {
                            onNodeClick(reviewNode);
                          }
                        }}
                      >
                        <div className="orbit-agent-head">
                          <span>{agent.domain}</span>
                          <strong>{agent.outcome.label}</strong>
                        </div>
                        <h4>{agent.title}</h4>
                        <p>{agent.subtitle}</p>
                        {agent.tavilyActive ? <span className="orbit-tavily-indicator">Tavily</span> : null}
                      </button>
                    ))}
                  </div>
                </section>
              </section>
            </div>
          </div>

          <aside className="boardroom-panel boardroom-pulse-aside">
            <div className="panel-header">
              <h2>Workflow Editor</h2>
              <p>View execution status and step-level progress in real time.</p>
            </div>

            <div className="panel-body boardroom-pulse-aside-body">
              <label className="workflow-control-toggle" htmlFor="editor-enable-research">
                <div>
                  <strong>Enable Research</strong>
                  <p>Use external web research during executive reviews.</p>
                </div>
                <span className={`pipeline-switch${!tavilyConfigured ? " disabled" : ""}`}>
                  <input
                    id="editor-enable-research"
                    type="checkbox"
                    checked={includeExternalResearch}
                    onChange={(event) => onIncludeExternalResearchChange(event.target.checked)}
                    disabled={!tavilyConfigured}
                  />
                  <span className="pipeline-switch-track" />
                </span>
              </label>

              <label className="workflow-control-toggle" htmlFor="editor-enable-red-team">
                <div>
                  <strong>Enable Red-Team</strong>
                  <p>Activate Pre-Mortem and Resource Competitor reviewers.</p>
                </div>
                <span className="pipeline-switch">
                  <input
                    id="editor-enable-red-team"
                    type="checkbox"
                    checked={includeRedTeamPersonas}
                    onChange={(event) => onIncludeRedTeamPersonasChange(event.target.checked)}
                  />
                  <span className="pipeline-switch-track" />
                </span>
              </label>

              <div className="workflow-control-rounds">
                <p>Cross-Agent Rebuttal Rounds</p>
                <div className="workflow-control-round-buttons" role="group" aria-label="Cross-Agent Rebuttal Rounds">
                  {REBUTTAL_ROUND_OPTIONS.map((rounds) => (
                    <button
                      key={rounds}
                      type="button"
                      className={interactionRounds === rounds ? "active" : undefined}
                      onClick={() => onInteractionRoundsChange(rounds)}
                    >
                      {rounds}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="panel-logs boardroom-pulse-footer-log">
              <div className="log-header">
                <span>Execution Trace</span>
                <span className="log-status" aria-hidden="true" style={{ opacity: isRunning ? 1 : 0.35 }} />
              </div>
              <div className="log-body">
                {executionTraceEntries.length > 0 ? (
                  executionTraceEntries.map((entry) => (
                    <p key={entry.id}>
                      {entry.timestamp ? <span className="log-time">{entry.timestamp}</span> : null}
                      <span className={`log-tag tag-${entry.tag.toLowerCase()}`}>[{entry.tag}]</span>
                      {entry.message}
                    </p>
                  ))
                ) : (
                  <p className="log-idle">Awaiting pipeline execution...</p>
                )}
              </div>
            </div>
          </aside>
        </div>
      </section>
    </section>
  );
}
