export interface WorkflowEvent {
  type: string;
  payload: Record<string, unknown>;
}
