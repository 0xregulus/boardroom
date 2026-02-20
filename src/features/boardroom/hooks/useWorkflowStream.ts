import { useState, useCallback } from "react";
import type { ApiResult } from "../types";

export interface WorkflowStreamPayload {
    decisionId?: string;
    agentConfigs?: any[];
    includeExternalResearch?: boolean;
    researchProvider?: string;
    includeRedTeamPersonas?: boolean;
    interactionRounds?: number;
    includeSensitive?: boolean;
}

export interface WorkflowStreamTraceEvent {
    tag: "EXEC" | "WARN" | "ERROR";
    message: string;
    agentId?: string;
}

interface RunWorkflowCallbacks {
    onTrace?: (event: WorkflowStreamTraceEvent) => void;
    onAgentThinking?: (payload: { index: number; agentId?: string; influence: number }) => void;
    onAgentResult?: (payload: { index: number; agentId?: string; influence: number; score?: number }) => void;
}

export function useWorkflowStream() {
    const [liveInfluence, setLiveInfluence] = useState<number[]>(new Array(12).fill(0));
    const [thinkingAgents, setThinkingAgents] = useState<boolean[]>(new Array(12).fill(false));
    const [isRunning, setIsRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<ApiResult | null>(null);

    const runWorkflow = useCallback(async (payload: WorkflowStreamPayload, callbacks?: RunWorkflowCallbacks) => {
        setIsRunning(true);
        setError(null);
        setResult(null);
        setLiveInfluence(new Array(12).fill(0));
        setThinkingAgents(new Array(12).fill(false));

        try {
            const response = await fetch("/api/workflow/run", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "text/event-stream",
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const json = await response.json().catch(() => ({}));
                throw new Error(json.error || "Workflow run failed");
            }

            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error("Response body is not readable");
            }

            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
                const frames = buffer.split("\n\n");
                buffer = frames.pop() || "";

                for (const frame of frames) {
                    const lines = frame.split("\n");
                    let currentEvent = "";
                    for (const line of lines) {
                        if (line.startsWith("event: ")) {
                            currentEvent = line.slice(7).trim();
                        } else if (line.startsWith("data: ")) {
                            try {
                                const data = JSON.parse(line.slice(6));
                                const parsedIndex = Number.isInteger(data.index) ? Number(data.index) : -1;
                                const hasKnownIndex = (index: number): boolean => index >= 0 && index < 12;

                                if (currentEvent === "agent_thinking") {
                                    const influence = Math.max(0, Math.min(1, Number(data.influence ?? 0.72)));
                                    if (hasKnownIndex(parsedIndex)) {
                                        setThinkingAgents(prev => {
                                            const next = [...prev];
                                            next[parsedIndex] = true;
                                            return next;
                                        });
                                        setLiveInfluence(prev => {
                                            const next = [...prev];
                                            next[parsedIndex] = influence;
                                            return next;
                                        });
                                    }
                                    callbacks?.onAgentThinking?.({
                                        index: parsedIndex,
                                        agentId: typeof data.agentId === "string" ? data.agentId : undefined,
                                        influence,
                                    });
                                } else if (currentEvent === "agent_result") {
                                    const influence = Math.max(0, Math.min(1, Number(data.influence ?? 0)));
                                    if (hasKnownIndex(parsedIndex)) {
                                        setThinkingAgents(prev => {
                                            const next = [...prev];
                                            next[parsedIndex] = false;
                                            return next;
                                        });
                                        setLiveInfluence(prev => {
                                            const next = [...prev];
                                            next[parsedIndex] = influence;
                                            return next;
                                        });
                                    }
                                    callbacks?.onAgentResult?.({
                                        index: parsedIndex,
                                        agentId: typeof data.agentId === "string" ? data.agentId : undefined,
                                        influence,
                                        score: typeof data.score === "number" ? data.score : undefined,
                                    });
                                } else if (currentEvent === "final_result") {
                                    setResult(data);
                                } else if (currentEvent === "execution_trace") {
                                    if (typeof data?.message === "string" && data.message.trim().length > 0) {
                                        const normalizedTag =
                                            data.tag === "WARN" || data.tag === "ERROR" || data.tag === "EXEC" ? data.tag : "EXEC";
                                        callbacks?.onTrace?.({
                                            tag: normalizedTag,
                                            message: data.message,
                                            agentId: typeof data.agentId === "string" ? data.agentId : undefined,
                                        });
                                    }
                                }
                            } catch (e) {
                                console.error("Failed to parse SSE data", e);
                            }
                        }
                    }
                }
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsRunning(false);
        }
    }, []);

    return {
        liveInfluence,
        thinkingAgents,
        isRunning,
        error,
        result,
        runWorkflow,
    };
}
