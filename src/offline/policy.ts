import { isOfflineModeEnabled, resolveOfflineDelayMs } from "./mode";

export type OfflineAwareEmbeddingProvider = "openai" | "local-hash";

export interface EmbeddingOfflinePolicy {
  provider: OfflineAwareEmbeddingProvider;
  fallbackDelayMs: number | null;
}

const WORKFLOW_OFFLINE_TRACE_MESSAGE =
  "Offline mode active: external provider calls are mocked with synthetic latency and responses.";

export function resolveEmbeddingOfflinePolicy(
  requestedProvider: OfflineAwareEmbeddingProvider,
  text: string,
  env: NodeJS.ProcessEnv | undefined = process.env,
): EmbeddingOfflinePolicy {
  if (!isOfflineModeEnabled(env) || requestedProvider !== "openai") {
    return {
      provider: requestedProvider,
      fallbackDelayMs: null,
    };
  }

  return {
    provider: "local-hash",
    fallbackDelayMs: resolveOfflineDelayMs(`embedding:${text.slice(0, 120)}`, env),
  };
}

export function resolveWorkflowOfflineTraceMessage(
  env: NodeJS.ProcessEnv | undefined = process.env,
): string | null {
  return isOfflineModeEnabled(env) ? WORKFLOW_OFFLINE_TRACE_MESSAGE : null;
}
