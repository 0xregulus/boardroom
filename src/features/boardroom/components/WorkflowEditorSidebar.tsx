import type { ResearchProvider } from "../../../research/providers";
import { REBUTTAL_ROUND_OPTIONS } from "./workflowEditorStage.helpers";

interface ExecutionTraceEntry {
  id: string;
  timestamp: string | null;
  tag: string;
  message: string;
}

interface WorkflowEditorSidebarProps {
  includeExternalResearch: boolean;
  researchProvider: ResearchProvider;
  researchProviderConfigured: boolean;
  includeRedTeamPersonas: boolean;
  interactionRounds: number;
  onIncludeExternalResearchChange: (checked: boolean) => void;
  onIncludeRedTeamPersonasChange: (checked: boolean) => void;
  onInteractionRoundsChange: (rounds: number) => void;
  executionTraceEntries: ExecutionTraceEntry[];
  isRunning: boolean;
}

export function WorkflowEditorSidebar({
  includeExternalResearch,
  researchProvider,
  researchProviderConfigured,
  includeRedTeamPersonas,
  interactionRounds,
  onIncludeExternalResearchChange,
  onIncludeRedTeamPersonasChange,
  onInteractionRoundsChange,
  executionTraceEntries,
  isRunning,
}: WorkflowEditorSidebarProps) {
  return (
    <aside className="boardroom-panel boardroom-pulse-aside">
      <div className="panel-header">
        <h2>Arena</h2>
        <p>View execution status and step-level progress in real time.</p>
      </div>

      <div className="panel-body boardroom-pulse-aside-body">
        <label className="workflow-control-toggle" htmlFor="editor-enable-research">
          <div>
            <strong>Enable Research</strong>
            <p>Use {researchProvider} web research during executive reviews.</p>
          </div>
          <span className={`pipeline-switch${!researchProviderConfigured ? " disabled" : ""}`}>
            <input
              id="editor-enable-research"
              type="checkbox"
              checked={includeExternalResearch}
              onChange={(event) => onIncludeExternalResearchChange(event.target.checked)}
              disabled={!researchProviderConfigured}
            />
            <span className="pipeline-switch-track" />
          </span>
        </label>

        <label className="workflow-control-toggle" htmlFor="editor-enable-red-team">
          <div>
            <strong>Enable Red-Team</strong>
            <p>Activate Pre-Mortem, Resource Competitor, Risk Agent, and Devil&apos;s Advocate reviewers.</p>
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
  );
}
