import { useEffect, useMemo, useState } from "react";

import type { ResearchProvider } from "../../../research/providers";
import type { DecisionStrategy, WorkflowNode } from "../types";
import { WorkflowEditorPulseCanvas } from "./WorkflowEditorPulseCanvas";
import { WorkflowEditorSidebar } from "./WorkflowEditorSidebar";
import type { OrbitAgentView } from "./workflowEditorStage.helpers";
import {
  buildTaskIndex,
  clamp01,
  deriveActiveRebuttalRound,
  domainForAgent,
  extractTraceTag,
  influenceFromAgent,
  normalizeKey,
  ORBIT_AGENT_RADIUS,
  ORBIT_CENTER_X,
  ORBIT_CENTER_Y,
  outcomeForAgent,
  PULSE_MAX_AGENTS,
  REVIEWER_SPECS,
  splitLogLine,
  STAGE_FLOW,
} from "./workflowEditorStage.helpers";

interface WorkflowEditorStageProps {
  selectedStrategy: DecisionStrategy | null;
  includeExternalResearch: boolean;
  researchProvider: ResearchProvider;
  includeRedTeamPersonas: boolean;
  interactionRounds: number;
  researchProviderConfigured: boolean;
  nodes: WorkflowNode[];
  selectedNode: WorkflowNode | null;
  selectedNodeId: string | null;
  expandedNodeId: string | null;
  logLines: string[];
  isRunning: boolean;
  runLabel: string;
  error: string | null;
  liveInfluence: number[];
  thinkingAgents: boolean[];
  onBack: () => void;
  onRun: () => void;
  onNodeClick: (node: WorkflowNode) => void;
  onIncludeExternalResearchChange: (checked: boolean) => void;
  onIncludeRedTeamPersonasChange: (checked: boolean) => void;
  onInteractionRoundsChange: (rounds: number) => void;
}

export function WorkflowEditorStage({
  includeExternalResearch,
  researchProvider,
  includeRedTeamPersonas,
  interactionRounds,
  researchProviderConfigured,
  nodes,
  selectedNode,
  selectedNodeId,
  logLines,
  isRunning,
  liveInfluence,
  thinkingAgents,
  onNodeClick,
  onIncludeExternalResearchChange,
  onIncludeRedTeamPersonasChange,
  onInteractionRoundsChange,
}: WorkflowEditorStageProps) {
  const [orbitMotionTime, setOrbitMotionTime] = useState(0);
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

  useEffect(() => {
    if (!isRunning) {
      setOrbitMotionTime(0);
      return;
    }

    let frameId = 0;
    const start = performance.now();
    const animate = (now: number) => {
      setOrbitMotionTime((now - start) / 1000);
      frameId = window.requestAnimationFrame(animate);
    };

    frameId = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frameId);
  }, [isRunning]);

  const activeRebuttalRound = useMemo(
    () => deriveActiveRebuttalRound(logLines, interactionRounds, isRunning),
    [interactionRounds, isRunning, logLines],
  );

  const orbitAgents = useMemo<OrbitAgentView[]>(() => {
    const reviewNode = nodeIndex.get("3");
    const taskIndex = buildTaskIndex(reviewNode?.tasks);
    const specByKey = new Map(REVIEWER_SPECS.map((spec) => [normalizeKey(spec.title), spec] as const));
    const renderedReviewers: Array<{ title: string; subtitle: string; requiresRedTeam?: boolean }> = [];
    const seen = new Set<string>();

    for (const spec of REVIEWER_SPECS) {
      const key = normalizeKey(spec.title);
      const isInTasks = taskIndex.has(key);
      if (isInTasks || spec.requiresRedTeam) {
        renderedReviewers.push(spec);
        seen.add(key);
      }
    }

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
    const radius = ORBIT_AGENT_RADIUS;
    const slotCount = renderedReviewers.length;
    const angleStep = (Math.PI * 2) / slotCount;
    const roundProgress = activeRebuttalRound > 0 ? activeRebuttalRound / Math.max(1, interactionRounds) : 0;
    const executionMomentum = isRunning ? (activeRebuttalRound > 0 ? roundProgress : 0.36) : 0;
    const syntheticRunnerIndex = isRunning ? Math.floor(orbitMotionTime * 1.45) % Math.max(1, slotCount) : -1;

    return renderedReviewers.map((reviewer, index) => {
      const task = taskIndex.get(normalizeKey(reviewer.title));
      const disabled = Boolean(reviewer.requiresRedTeam) && !includeRedTeamPersonas;
      const streamInfluence = disabled ? 0 : clamp01(liveInfluence[index] ?? 0);
      const streamThinking = !disabled && Boolean(thinkingAgents[index]);
      const fallbackStatus = task?.status ?? "IDLE";
      const status = disabled
        ? "IDLE"
        : streamThinking || (isRunning && streamInfluence > 0.08)
          ? "RUNNING"
          : isRunning && syntheticRunnerIndex === index
            ? "RUNNING"
            : fallbackStatus;
      const outcome = outcomeForAgent(status, reviewer.title, disabled);
      const phase = activeRebuttalRound * 0.9 + orbitMotionTime * 1.35 + index * 0.72;
      const angularNudge = Math.sin(phase) * (0.014 + executionMomentum * 0.06);
      const angle = -Math.PI / 2 + index * angleStep + angularNudge;
      const pullStrength =
        status === "RUNNING"
          ? 30 + streamInfluence * 42
          : outcome.tone === "challenged"
            ? 20
            : outcome.tone === "blocked"
              ? 14
              : 0;
      const roundRadialPulse = Math.cos(phase * 1.12) * (5 + executionMomentum * 14);
      const rebuttalPull =
        executionMomentum > 0
          ? status === "RUNNING"
            ? 18 + executionMomentum * 20
            : outcome.tone === "challenged"
              ? 12 + executionMomentum * 15
              : outcome.tone === "blocked"
                ? 10 + executionMomentum * 11
                : executionMomentum * 6
          : 0;
      const streamRadiusPull = streamInfluence * (isRunning ? 34 : 0);
      const dynamicRadius = Math.max(254, radius - pullStrength - rebuttalPull - streamRadiusPull + roundRadialPulse);
      const x = centerX + Math.cos(angle) * dynamicRadius;
      const y = centerY + Math.sin(angle) * dynamicRadius;
      const roundIntensity =
        executionMomentum > 0
          ? (Math.abs(Math.sin(phase)) * 0.55 + Math.abs(Math.cos(phase * 1.08)) * 0.45) * executionMomentum
          : 0;
      const runtimeRoundIntensity = Math.max(
        roundIntensity,
        streamThinking ? 0.5 + streamInfluence * 0.5 : streamInfluence * 0.32,
      );

      return {
        id: reviewer.title,
        orbitIndex: index,
        title: reviewer.title,
        domain: domainForAgent(reviewer.title),
        subtitle: reviewer.subtitle,
        status,
        outcome,
        researchActive: Boolean(includeExternalResearch) && status === "RUNNING",
        x,
        y,
        pullStrength,
        roundPhase: phase,
        roundIntensity: runtimeRoundIntensity,
        streamInfluence,
      };
    });
  }, [
    activeRebuttalRound,
    includeExternalResearch,
    includeRedTeamPersonas,
    interactionRounds,
    isRunning,
    liveInfluence,
    nodeIndex,
    orbitMotionTime,
    thinkingAgents,
  ]);

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

  const reviewOrbitActive = nodeIndex.get("3")?.status === "RUNNING";
  const rebuttalOrbitActive = nodeIndex.get("4")?.status === "RUNNING";
  const liveOrbitExecution = isRunning || reviewOrbitActive || rebuttalOrbitActive;

  const pulseAgentSignals = useMemo(() => {
    const runningOrbitIndices = orbitAgents
      .filter((agent) => agent.status === "RUNNING" && agent.outcome.label !== "Disabled")
      .map((agent) => agent.orbitIndex);
    const focusedRunningOrbitIndex =
      runningOrbitIndices.length > 0
        ? runningOrbitIndices[Math.floor(orbitMotionTime * 1.8) % runningOrbitIndices.length]
        : -1;

    const normalized = orbitAgents.map((agent) => {
      const isDisabled = agent.outcome.label === "Disabled";
      const baseInfluence = influenceFromAgent(agent);
      const runtimeBaseline =
        !isDisabled && liveOrbitExecution
          ? agent.status === "RUNNING"
            ? rebuttalOrbitActive
              ? 0.24
              : 0.18
            : agent.status === "COMPLETED"
              ? 0.06
              : 0.12
          : 0;
      const kineticInfluence = liveOrbitExecution && agent.status === "RUNNING"
        ? (rebuttalOrbitActive ? 0.28 : 0.2) * agent.roundIntensity
        : 0;
      const liveKineticFloor = !isDisabled && liveOrbitExecution
        ? 0.14 + agent.roundIntensity * 0.22
        : 0;
      const runningBoost = 0;
      const dx = (agent.x - ORBIT_CENTER_X) / 306;
      const dy = (ORBIT_CENTER_Y - agent.y) / 306;
      const angle = Math.atan2(agent.y - ORBIT_CENTER_Y, agent.x - ORBIT_CENTER_X) + agent.roundPhase * 0.07;
      const zBias = Math.sin(angle * 2) * 0.2 + agent.roundIntensity * 0.12 + (agent.status === "RUNNING" ? 0.08 : 0);
      const focusFactor =
        agent.status === "RUNNING"
          ? runningOrbitIndices.length <= 1
            ? 1.35
            : agent.orbitIndex === focusedRunningOrbitIndex
              ? 1.7
              : 0.2
          : 1;

      const rawInfluence = isRunning && agent.streamInfluence > 0
        ? Math.max(
          agent.streamInfluence * focusFactor,
          (baseInfluence + runtimeBaseline + kineticInfluence + runningBoost) * focusFactor,
          liveKineticFloor * focusFactor,
        )
        : Math.max(
          0,
          Math.min(
            1,
            Math.max((baseInfluence + runtimeBaseline + kineticInfluence + runningBoost) * focusFactor, liveKineticFloor * focusFactor),
          ),
        );
      const finalInfluence = clamp01(rawInfluence);

      return {
        influence: finalInfluence,
        position: [dx * 1.12, dy * 1.12, zBias] as [number, number, number],
      };
    });

    normalized.sort((a, b) => b.influence - a.influence);
    return normalized.slice(0, PULSE_MAX_AGENTS);
  }, [isRunning, liveOrbitExecution, orbitAgents, orbitMotionTime, rebuttalOrbitActive]);

  const pulseAgentInfluence = useMemo(() => {
    const values = new Array<number>(PULSE_MAX_AGENTS).fill(0);
    for (let i = 0; i < pulseAgentSignals.length; i += 1) {
      values[i] = pulseAgentSignals[i].influence;
    }
    return values;
  }, [pulseAgentSignals]);

  const pulseAgentPositions = useMemo(() => {
    const values = new Array<[number, number, number]>(PULSE_MAX_AGENTS).fill([0, 0, 1]);
    for (let i = 0; i < pulseAgentSignals.length; i += 1) {
      values[i] = pulseAgentSignals[i].position;
    }
    return values;
  }, [pulseAgentSignals]);

  const parsedLogLines = useMemo(() => logLines.map(splitLogLine), [logLines]);

  const refinementFeed = useMemo(() => {
    if (parsedLogLines.length === 0) {
      return [];
    }

    return parsedLogLines.slice(-10).map((entry, index) => {
      const lineNo = String(index + 1).padStart(2, "0");
      const explicitTrace = extractTraceTag(entry.message);
      const normalizedMessage = explicitTrace.message;
      const tag = explicitTrace.tag
        ? explicitTrace.tag
        : normalizedMessage.toLowerCase().includes("review")
          ? "REVIEW"
          : normalizedMessage.toLowerCase().includes("rebuttal")
            ? "DEBATE"
            : normalizedMessage.toLowerCase().includes("synthesis")
              ? "SYNC"
              : "EXEC";
      return {
        id: `${lineNo}-${entry.message}`,
        tag,
        timestamp: entry.timestamp ?? "--:--:--",
        message: normalizedMessage,
      };
    });
  }, [parsedLogLines]);

  const researchEvidence = useMemo(() => {
    if (!includeExternalResearch) {
      return [];
    }

    const activeResearchers = orbitAgents.filter((agent) => agent.researchActive);
    if (activeResearchers.length > 0) {
      return activeResearchers.map((agent) => ({
        id: `live-${agent.id}`,
        source: `${agent.domain.toUpperCase()} AGENT`,
        note: `${agent.title} scanning ${researchProvider} sources for counter-evidence.`,
      }));
    }

    return orbitAgents
      .filter((agent) => agent.outcome.tone === "approved" || agent.outcome.tone === "challenged")
      .slice(0, 3)
      .map((agent, index) => ({
        id: `evidence-${agent.id}`,
        source: `${agent.domain.toUpperCase()} ${index + 1}`,
        note: `${agent.title} validated external benchmark assumptions via ${researchProvider}.`,
      }));
  }, [includeExternalResearch, orbitAgents, researchProvider]);

  const executionTraceEntries = useMemo(() => {
    const refinementEntries = refinementFeed.map((entry) => ({
      id: `ref-${entry.id}`,
      timestamp: entry.timestamp === "--:--:--" ? null : entry.timestamp,
      tag: entry.tag,
      message: entry.message,
    }));

    const researchEntries = researchEvidence.map((entry) => ({
      id: `research-${entry.id}`,
      timestamp: null,
      tag: researchProvider.toUpperCase(),
      message: `${entry.source}: ${entry.note}`,
    }));

    return [...refinementEntries, ...researchEntries].slice(-14);
  }, [refinementFeed, researchEvidence, researchProvider]);

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
                    Research: {researchProvider}
                  </span>
                ) : null}
              </div>

              <WorkflowEditorPulseCanvas
                researchProvider={researchProvider}
                interactionRounds={interactionRounds}
                orbitAgents={orbitAgents}
                selectedStepId={selectedStep?.id}
                nodeIndex={nodeIndex}
                onNodeClick={onNodeClick}
                pulseDqs={pulseDqs}
                pulseAgentInfluence={pulseAgentInfluence}
                pulseAgentPositions={pulseAgentPositions}
                thinkingAgents={thinkingAgents}
                isRunning={isRunning}
                executionSnapshot={executionSnapshot}
              />
            </div>
          </div>

          <WorkflowEditorSidebar
            includeExternalResearch={includeExternalResearch}
            researchProvider={researchProvider}
            researchProviderConfigured={researchProviderConfigured}
            includeRedTeamPersonas={includeRedTeamPersonas}
            interactionRounds={interactionRounds}
            onIncludeExternalResearchChange={onIncludeExternalResearchChange}
            onIncludeRedTeamPersonasChange={onIncludeRedTeamPersonasChange}
            onInteractionRoundsChange={onInteractionRoundsChange}
            executionTraceEntries={executionTraceEntries}
            isRunning={isRunning}
          />
        </div>
      </section>
    </section>
  );
}
