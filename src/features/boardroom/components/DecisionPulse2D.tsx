import { useMemo } from "react";

import { DecisionPulse, type PulseClassification } from "./DecisionPulse";

interface DecisionPulse2DProps {
  dqs: number;
  runtimeActive?: boolean;
  mode?: "default" | "socratic" | "socratic-red-team";
  tugVector?: [number, number] | null;
  settling?: boolean;
  stable?: boolean;
  isStatic?: boolean;
  classification?: PulseClassification;
  agentInfluence?: number[];
  agentPositions?: Array<[number, number, number]>;
  previousRunPoints?: Array<{ x: number; y: number }>;
}

export function DecisionPulse2D({
  dqs,
  runtimeActive = false,
  mode = "default",
  tugVector = null,
  settling = false,
  stable = false,
  isStatic = false,
  classification,
  agentInfluence,
  agentPositions,
  previousRunPoints,
}: DecisionPulse2DProps) {
  const influence = useMemo(() => {
    if (Array.isArray(agentInfluence) && agentInfluence.length > 0) {
      return Array.from({ length: 12 }, (_, index) => {
        const value = agentInfluence[index] ?? 0;
        return Math.max(0, Math.min(1, value));
      });
    }
    const base = runtimeActive ? 0.72 : 0.36;
    return Array.from({ length: 12 }, () => base);
  }, [agentInfluence, runtimeActive]);

  return (
    <DecisionPulse
      dqs={dqs}
      readinessScore={dqs}
      agentInfluence={influence}
      agentPositions={agentPositions}
      runtimeActive={runtimeActive}
      socraticMode={mode !== "default"}
      redTeamMode={mode === "socratic-red-team"}
      socraticTug={tugVector}
      classification={classification}
      settlingMode={settling}
      stableMode={stable}
      freezeMode={isStatic}
      previousRunPoints={previousRunPoints}
    />
  );
}
