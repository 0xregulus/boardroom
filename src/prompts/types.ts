export interface PromptDefinition {
  id: string;
  version: string;
  systemMessage: string;
  userTemplate: string;
}

export type PromptRegistry = Record<string, PromptDefinition>;
