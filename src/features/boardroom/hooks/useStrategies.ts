import { useState, useEffect } from "react";
import { DecisionStrategy, StrategyListResponse } from "../types";

export function useStrategies() {
    const [strategies, setStrategies] = useState<DecisionStrategy[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function loadStrategies() {
            setIsLoading(true);
            setError(null);

            try {
                const response = await fetch("/api/strategies?includeSensitive=true");
                const json = (await response.json()) as StrategyListResponse;
                if (!response.ok) {
                    throw new Error(json.details || json.error || "Failed to load strategic decision log.");
                }

                const remoteStrategies = Array.isArray(json.strategies) ? json.strategies : [];
                if (cancelled) {
                    return;
                }

                if (remoteStrategies.length > 0) {
                    setStrategies(remoteStrategies);
                } else {
                    setStrategies([]);
                    setError("No records found in the Strategic Decision Log.");
                }
            } catch (loadError) {
                if (!cancelled) {
                    const message = loadError instanceof Error ? loadError.message : String(loadError);
                    setError(message);
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        }

        loadStrategies();

        return () => {
            cancelled = true;
        };
    }, []);

    return { strategies, setStrategies, isLoading, error };
}
