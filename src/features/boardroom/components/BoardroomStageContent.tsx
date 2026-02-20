import type { ComponentProps } from "react";

import type { ActiveTab, AppStage, WorkspaceView } from "../types";
import { AgentConfigModal } from "./AgentConfigModal";
import { CreateStrategyStage } from "./CreateStrategyStage";
import { DecisionAncestryPanel } from "./DecisionAncestryPanel";
import { StrategyDetails } from "./StrategyDetails";
import { StrategyList } from "./StrategyList";
import { WorkflowEditorStage } from "./WorkflowEditorStage";
import { WorkflowPreviewStage } from "./WorkflowPreviewStage";

interface BoardroomStageContentProps {
  appStage: AppStage;
  workspaceView: WorkspaceView;
  activeTab: ActiveTab;
  strategyListProps: ComponentProps<typeof StrategyList>;
  strategyDetailsProps: ComponentProps<typeof StrategyDetails>;
  decisionAncestryPanelProps: ComponentProps<typeof DecisionAncestryPanel>;
  createStrategyStageProps: ComponentProps<typeof CreateStrategyStage>;
  agentConfigModalProps: ComponentProps<typeof AgentConfigModal>;
  workflowEditorStageProps: ComponentProps<typeof WorkflowEditorStage>;
  workflowPreviewStageProps: ComponentProps<typeof WorkflowPreviewStage>;
}

export function BoardroomStageContent({
  appStage,
  workspaceView,
  activeTab,
  strategyListProps,
  strategyDetailsProps,
  decisionAncestryPanelProps,
  createStrategyStageProps,
  agentConfigModalProps,
  workflowEditorStageProps,
  workflowPreviewStageProps,
}: BoardroomStageContentProps) {
  if (appStage === "list") {
    return (
      <section className="strategy-stage">
        <aside className="strategy-sidebar">
          <StrategyList {...strategyListProps} />
        </aside>

        <div className="strategy-preview">
          <StrategyDetails {...strategyDetailsProps} />
        </div>

        <aside className="strategy-ancestry">
          <DecisionAncestryPanel {...decisionAncestryPanelProps} />
        </aside>
      </section>
    );
  }

  if (appStage === "create") {
    return <CreateStrategyStage {...createStrategyStageProps} />;
  }

  if (workspaceView === "agent-config") {
    return <AgentConfigModal {...agentConfigModalProps} />;
  }

  if (activeTab === "editor") {
    return (
      <section className="pipeline-settings-stage full-page">
        <div className="pipeline-settings-main full-page">
          <WorkflowEditorStage {...workflowEditorStageProps} />
        </div>
      </section>
    );
  }

  return <WorkflowPreviewStage {...workflowPreviewStageProps} />;
}
