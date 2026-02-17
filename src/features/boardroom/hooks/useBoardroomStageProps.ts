import { useMemo } from "react";
import type { ComponentProps } from "react";

import { AgentConfigModal } from "../components/AgentConfigModal";
import { CreateStrategyStage } from "../components/CreateStrategyStage";
import { StrategyDetails } from "../components/StrategyDetails";
import { StrategyList } from "../components/StrategyList";
import { WorkflowEditorStage } from "../components/WorkflowEditorStage";
import { WorkflowPreviewStage } from "../components/WorkflowPreviewStage";

type StrategyListProps = ComponentProps<typeof StrategyList>;
type StrategyDetailsProps = ComponentProps<typeof StrategyDetails>;
type CreateStrategyStageProps = ComponentProps<typeof CreateStrategyStage>;
type AgentConfigModalProps = ComponentProps<typeof AgentConfigModal>;
type WorkflowEditorStageProps = ComponentProps<typeof WorkflowEditorStage>;
type WorkflowPreviewStageProps = ComponentProps<typeof WorkflowPreviewStage>;

interface UseBoardroomStagePropsParams {
  strategyList: StrategyListProps;
  details: StrategyDetailsProps;
  create: CreateStrategyStageProps;
  agentConfig: AgentConfigModalProps;
  editor: WorkflowEditorStageProps;
  preview: WorkflowPreviewStageProps;
}

interface UseBoardroomStagePropsResult {
  strategyListProps: StrategyListProps;
  strategyDetailsProps: StrategyDetailsProps;
  createStrategyStageProps: CreateStrategyStageProps;
  agentConfigModalProps: AgentConfigModalProps;
  workflowEditorStageProps: WorkflowEditorStageProps;
  workflowPreviewStageProps: WorkflowPreviewStageProps;
}

export function useBoardroomStageProps({
  strategyList,
  details,
  create,
  agentConfig,
  editor,
  preview,
}: UseBoardroomStagePropsParams): UseBoardroomStagePropsResult {
  const strategyListProps = useMemo(() => strategyList, [strategyList]);
  const strategyDetailsProps = useMemo(() => details, [details]);
  const createStrategyStageProps = useMemo(() => create, [create]);
  const agentConfigModalProps = useMemo(() => agentConfig, [agentConfig]);
  const workflowEditorStageProps = useMemo(() => editor, [editor]);
  const workflowPreviewStageProps = useMemo(() => preview, [preview]);

  return {
    strategyListProps,
    strategyDetailsProps,
    createStrategyStageProps,
    agentConfigModalProps,
    workflowEditorStageProps,
    workflowPreviewStageProps,
  };
}
