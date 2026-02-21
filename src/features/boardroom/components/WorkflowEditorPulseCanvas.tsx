import dynamic from "next/dynamic";

import type { ResearchProvider } from "../../../research/providers";
import type { WorkflowNode } from "../types";
import type { OrbitAgentView } from "./workflowEditorStage.helpers";
import {
  ORBIT_CENTER_LEFT,
  ORBIT_CENTER_TOP,
  ORBIT_CENTER_X,
  ORBIT_CENTER_Y,
  ORBIT_VIEWBOX_HEIGHT,
  ORBIT_VIEWBOX_WIDTH,
  REFINEMENT_RING_LEVELS,
} from "./workflowEditorStage.helpers";

const DecisionPulse = dynamic(
  () => import("./DecisionPulse").then((module) => module.DecisionPulse),
  { ssr: false },
);

interface WorkflowEditorPulseCanvasProps {
  researchProvider: ResearchProvider;
  interactionRounds: number;
  orbitAgents: OrbitAgentView[];
  selectedStepId?: string;
  nodeIndex: Map<string, WorkflowNode>;
  onNodeClick: (node: WorkflowNode) => void;
  pulseDqs: number;
  pulseAgentInfluence: number[];
  pulseAgentPositions: Array<[number, number, number]>;
  thinkingAgents: boolean[];
  isRunning: boolean;
  executionSnapshot: {
    substance: number;
    hygiene: number;
    state: string;
  };
}

export function WorkflowEditorPulseCanvas({
  researchProvider,
  interactionRounds,
  orbitAgents,
  selectedStepId,
  nodeIndex,
  onNodeClick,
  pulseDqs,
  pulseAgentInfluence,
  pulseAgentPositions,
  thinkingAgents,
  isRunning,
  executionSnapshot,
}: WorkflowEditorPulseCanvasProps) {
  const pulseStateClass = executionSnapshot.state.toLowerCase().replace(/\s+/g, "-");

  return (
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
            <DecisionPulse
              dqs={pulseDqs}
              agentInfluence={pulseAgentInfluence}
              thinkingAgents={thinkingAgents}
              agentPositions={pulseAgentPositions}
              runtimeActive={isRunning}
            />
          </div>

          {orbitAgents.map((agent) => (
            <button
              key={agent.id}
              type="button"
              className={`orbit-agent tone-${agent.outcome.tone}${selectedStepId === "3" ? " selected" : ""}`}
              style={{
                left: `${(agent.x / ORBIT_VIEWBOX_WIDTH) * 100}%`,
                top: `${(agent.y / ORBIT_VIEWBOX_HEIGHT) * 100}%`,
              }}
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
              {agent.researchActive ? <span className="orbit-tavily-indicator">{researchProvider}</span> : null}
            </button>
          ))}
        </div>
      </section>
    </section>
  );
}
