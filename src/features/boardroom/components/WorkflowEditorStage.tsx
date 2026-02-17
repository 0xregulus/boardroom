import { EDGES } from "../constants";
import { ChessPieceGlyph, EdgePath, NodeGlyph } from "./icons";
import type { ApiResult, DecisionStrategy, WorkflowNode } from "../types";
import { buildReviewTasks, resolveAgentChessPiece } from "../utils";

interface WorkflowEditorStageProps {
  nodes: WorkflowNode[];
  selectedNodeId: string | null;
  expandedNodeId: string | null;
  selectedNode: WorkflowNode | null;
  selectedStrategy: DecisionStrategy | null;
  decisionId: string;
  includeExternalResearch: boolean;
  interactionRounds: number;
  tavilyConfigured: boolean;
  logLines: string[];
  result: ApiResult | null;
  onNodeClick: (node: WorkflowNode) => void;
  onDecisionIdChange: (value: string) => void;
  onIncludeExternalResearchChange: (checked: boolean) => void;
  onInteractionRoundsChange: (rounds: number) => void;
}

function hasSubtasks(node: WorkflowNode): boolean {
  return (node.tasks?.length ?? 0) > 1;
}

function reviewTaskStatusLabel(status: WorkflowNode["status"]): string {
  if (status === "RUNNING") {
    return "BUSY";
  }
  if (status === "COMPLETED") {
    return "DONE";
  }
  if (status === "FAILED") {
    return "FAILED";
  }
  return "IDLE";
}

export function WorkflowEditorStage({
  nodes,
  selectedNodeId,
  expandedNodeId,
  selectedNode,
  selectedStrategy,
  decisionId,
  includeExternalResearch,
  interactionRounds,
  tavilyConfigured,
  logLines,
  result,
  onNodeClick,
  onDecisionIdChange,
  onIncludeExternalResearchChange,
  onInteractionRoundsChange,
}: WorkflowEditorStageProps) {
  return (
    <>
      <section className="boardroom-canvas" aria-label="Workflow canvas">
        <div className="canvas-inner">
          <svg className="canvas-edges" aria-hidden="true">
            <defs>
              <marker id="workflow-arrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <path d="M0,0 L0,7 L10,3.5 z" fill="#94a3b8" />
              </marker>
            </defs>
            {EDGES.map((edge) => {
              const source = nodes.find((node) => node.id === edge.source);
              const target = nodes.find((node) => node.id === edge.target);
              if (!source || !target) {
                return null;
              }
              return <EdgePath key={edge.id} start={source.position} end={target.position} />;
            })}
          </svg>

          {nodes.map((node) => {
            const expandable = hasSubtasks(node);
            const expanded = expandable && expandedNodeId === node.id;

            return (
              <button
                key={node.id}
                type="button"
                className={`workflow-node ${selectedNodeId === node.id ? "selected" : ""} ${expanded ? "expanded" : ""} status-${node.status.toLowerCase()}`}
                style={{ left: node.position.x, top: node.position.y }}
                onClick={() => onNodeClick(node)}
                aria-expanded={expandable ? expanded : undefined}
              >
                <div className="workflow-node-row">
                  <div className="workflow-glyph">
                    <NodeGlyph type={node.type} />
                  </div>
                  <div className="workflow-state">
                    {node.status === "RUNNING" ? <span className="workflow-running-dot" aria-hidden="true" /> : null}
                    {node.status === "COMPLETED" ? <span className="workflow-complete-mark">✓</span> : null}
                    <span className="workflow-status">{node.status}</span>
                  </div>
                </div>
                <h3>{node.title}</h3>
                <p>{node.subtitle}</p>

                {expandable ? (
                  <div className="workflow-expand-meta">
                    <span className="workflow-expand-count">
                      {node.type === "INTERACTION" ? `${node.tasks?.length} rounds` : `${node.tasks?.length} agents`}
                    </span>
                    {node.type === "REVIEW" ? <span className="workflow-parallel-badge">PARALLEL</span> : null}
                    {node.type === "INTERACTION" ? <span className="workflow-parallel-badge">SEQUENTIAL</span> : null}
                    <span className="workflow-chevron" aria-hidden="true">
                      ›
                    </span>
                  </div>
                ) : null}

                {expanded ? (
                  <ul className="workflow-subtasks" aria-label={`${node.title} tasks`}>
                    {node.tasks?.map((task) => (
                      <li key={task.id} className={`workflow-subtask-chip status-${task.status.toLowerCase()}`}>
                        <span className="workflow-subtask-main">
                          <span className="subtask-dot" aria-hidden="true" />
                          <span className="workflow-subtask-label">{task.title}</span>
                        </span>
                        <span className="workflow-subtask-status">{reviewTaskStatusLabel(task.status)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {node.status === "RUNNING" ? <span className="workflow-run-progress" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      </section>

      <aside className="boardroom-panel">
        <div className="panel-header">
          <h2>Configuration</h2>
          <p>Configure selected workflow node</p>
        </div>

        <div className="panel-body">
          {selectedNode ? (
            <>
              <div className="selection-header">
                <div className="workflow-glyph">
                  <NodeGlyph type={selectedNode.type} />
                </div>
                <div>
                  <h3>{selectedNode.title}</h3>
                  <p>Node ID: {selectedNode.id}</p>
                </div>
              </div>

              {selectedNode.type === "INPUT" ? (
                <>
                  {selectedStrategy ? (
                    <div className="input-context-card">
                      <p className="input-context-label">Active Strategy Context</p>
                      <strong>{selectedStrategy.name}</strong>
                      <span>{selectedStrategy.summary}</span>
                    </div>
                  ) : null}

                  <label className="form-control" htmlFor="decision-id-input">
                    Decision ID (optional)
                    <input
                      id="decision-id-input"
                      value={decisionId}
                      onChange={(event) => onDecisionIdChange(event.target.value)}
                      placeholder="Leave blank to process all Proposed items"
                    />
                  </label>

                  <label
                    className={`form-checkbox-control${!tavilyConfigured ? " disabled" : ""}`}
                    htmlFor="external-research-toggle"
                  >
                    <input
                      id="external-research-toggle"
                      type="checkbox"
                      checked={tavilyConfigured ? includeExternalResearch : false}
                      disabled={!tavilyConfigured}
                      onChange={(event) => onIncludeExternalResearchChange(event.target.checked)}
                    />
                    <span>Use Tavily external research</span>
                  </label>
                  <p className="form-checkbox-help">
                    {tavilyConfigured
                      ? "Enabled by default. Disable to run model-only evaluation without web research."
                      : "Unavailable. Set TAVILY_API_KEY on the server to enable Tavily research."}
                  </p>

                </>
              ) : null}

              {selectedNode.type === "REVIEW" ? (
                <div className="agent-grid">
                  {(selectedNode.tasks ?? buildReviewTasks(["CEO", "CFO", "CTO", "Compliance"])).map((agent) => (
                    <div key={agent.id} className={`agent-chip status-${agent.status.toLowerCase()}`}>
                      <span className="agent-indicator" aria-hidden="true">
                        <ChessPieceGlyph piece={resolveAgentChessPiece("", agent.title)} />
                      </span>
                      <span>{agent.title}</span>
                      <span className="agent-chip-status">{reviewTaskStatusLabel(agent.status)}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              {selectedNode.type === "SYNTHESIS" ? (
                <div className="score-card">
                  <p>DQS</p>
                  <strong>{result ? 87 : 0}</strong>
                  <span>/100</span>
                </div>
              ) : null}

              {selectedNode.type === "INTERACTION" ? (
                <>
                  <label className="form-control" htmlFor="interaction-rounds-input">
                    Cross-Agent Rebuttal Rounds
                    <input
                      id="interaction-rounds-input"
                      type="number"
                      min={0}
                      max={3}
                      step={1}
                      value={interactionRounds}
                      onChange={(event) => {
                        const next = Number(event.target.value);
                        if (!Number.isFinite(next)) {
                          onInteractionRoundsChange(1);
                          return;
                        }
                        onInteractionRoundsChange(Math.max(0, Math.min(3, Math.round(next))));
                      }}
                    />
                  </label>
                  <p className="form-checkbox-help">
                    Set to `0` to disable rebuttal; set `1-3` to run iterative peer challenge rounds before synthesis.
                  </p>
                </>
              ) : null}

              {selectedNode.type === "PERSIST" ? (
                <div className="sync-card">
                  <p>Target: Strategic Decision Log</p>
                  <strong>
                    {selectedNode.status === "COMPLETED"
                      ? "Synced successfully"
                      : selectedNode.status === "FAILED"
                        ? "Sync failed"
                        : "Waiting for execution"}
                  </strong>
                </div>
              ) : null}

              {!["INPUT", "REVIEW", "INTERACTION", "SYNTHESIS", "PERSIST"].includes(selectedNode.type) ? (
                <div className="panel-empty">This node runs automatically from upstream context.</div>
              ) : null}
            </>
          ) : (
            <div className="panel-placeholder">
              <div className="placeholder-arrow" aria-hidden="true">
                →
              </div>
              <h3>Select a Node</h3>
              <p>Click on any step in the workflow canvas to view details and configuration options.</p>
            </div>
          )}
        </div>

        <div className="panel-logs">
          <div className="log-header">
            <span>System Logs</span>
            <span className="log-status" aria-hidden="true" />
          </div>
          <div className="log-body">
            {logLines.length > 0 ? (
              logLines.map((line) => (
                <p key={line}>
                  <span aria-hidden="true">→</span>
                  {line}
                </p>
              ))
            ) : (
              <p className="log-idle">Waiting for execution...</p>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
