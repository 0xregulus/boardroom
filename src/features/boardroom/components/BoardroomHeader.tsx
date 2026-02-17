import type { ActiveTab, AppStage, DecisionStrategy, WorkspaceView } from "../types";
import { BoardroomIcon } from "./icons";

interface BoardroomHeaderProps {
  appStage: AppStage;
  workspaceView: WorkspaceView;
  activeTab: ActiveTab;
  selectedStrategy: DecisionStrategy | null;
  isRunning: boolean;
  runLabel: string;
  onHome: () => void;
  onOpenDashboard: () => void;
  onOpenAgentConfig: () => void;
  onSetActiveTab: (tab: ActiveTab) => void;
  onRun: () => void;
}

export function BoardroomHeader({
  appStage,
  workspaceView,
  activeTab,
  selectedStrategy,
  isRunning,
  runLabel,
  onHome,
  onOpenDashboard,
  onOpenAgentConfig,
  onSetActiveTab,
  onRun,
}: BoardroomHeaderProps) {
  return (
    <header className="boardroom-header">
      <div className="boardroom-header-left">
        <button type="button" className="boardroom-brand boardroom-brand-button" onClick={onHome}>
          <div className="boardroom-brand-icon" aria-hidden="true">
            <BoardroomIcon />
          </div>
          <div className="boardroom-brand-copy">
            <h1>Boardroom</h1>
            <p>Multi-Agent Workflow Engine</p>
          </div>
        </button>
        <span className="boardroom-nav-divider" aria-hidden="true" />
        <div className="workspace-view-tabs" role="tablist" aria-label="Workspace section mode">
          <button
            type="button"
            role="tab"
            aria-selected={appStage !== "workspace" || workspaceView === "dashboard"}
            className={appStage !== "workspace" || workspaceView === "dashboard" ? "active" : ""}
            onClick={onOpenDashboard}
          >
            Dashboard
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={appStage === "workspace" && workspaceView === "agent-config"}
            className={appStage === "workspace" && workspaceView === "agent-config" ? "active" : ""}
            onClick={onOpenAgentConfig}
          >
            Agent Config
          </button>
        </div>
      </div>

      {appStage === "workspace" && workspaceView === "dashboard" && selectedStrategy ? (
        <div className="boardroom-controls">
          <div className="boardroom-tabs" role="tablist" aria-label="Boardroom output mode">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "editor"}
              className={activeTab === "editor" ? "active" : ""}
              onClick={() => onSetActiveTab("editor")}
            >
              Workflow Editor
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "preview"}
              className={activeTab === "preview" ? "active" : ""}
              onClick={() => onSetActiveTab("preview")}
            >
              Output Preview
            </button>
          </div>

          <button type="button" className="boardroom-execute" onClick={onRun} disabled={isRunning}>
            <span className={isRunning ? "spinner" : "play-glyph"} aria-hidden="true" />
            {runLabel}
          </button>
        </div>
      ) : null}
    </header>
  );
}
