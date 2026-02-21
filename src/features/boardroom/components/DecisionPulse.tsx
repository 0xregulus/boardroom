import { useEffect, useMemo, useRef, useState } from "react";

export type PulseClassification = "high-friction" | "pending-mitigation" | "smooth-approval";
interface DecisionPulseProps {
  dqs: number;
  agentInfluence: number[];
  thinkingAgents?: boolean[];
  agentPositions?: Array<[number, number, number]>;
  runtimeActive?: boolean;
  socraticMode?: boolean;
  redTeamMode?: boolean;
  classification?: PulseClassification;
  socraticTug?: [number, number] | null;
  readinessScore?: number;
  settlingMode?: boolean;
  stableMode?: boolean;
  freezeMode?: boolean;
  previousRunPoints?: Array<{ x: number; y: number }>;
}

const MAX_AGENTS = 12;
const VIEWBOX_SIZE = 260;
const CENTER = VIEWBOX_SIZE / 2;
const BASE_RADIUS = 78;
const POINTS = 30;
const MAX_PULL = 32;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function getPalette(
  dqs: number,
  socraticMode = false,
  redTeamMode = false,
  classification?: PulseClassification,
): { core: string; mid: string; edge: string; glow: string } {
  if (redTeamMode) {
    return {
      core: "#991b1b",
      mid: "#b91c1c",
      edge: "#fecaca",
      glow: "rgba(153, 27, 27, 0.32)",
    };
  }
  if (socraticMode) {
    return {
      core: "#60a5fa",
      mid: "#3b82f6",
      edge: "#2563eb",
      glow: "rgba(96, 165, 250, 0.24)",
    };
  }

  // Classification-based coloring overrides default DQS logic
  if (classification === "high-friction") {
    return { core: "#ef4444", mid: "#f87171", edge: "#b91c1c", glow: "rgba(239, 68, 68, 0.34)" };
  }
  if (classification === "pending-mitigation") {
    return { core: "#f59e0b", mid: "#fbbf24", edge: "#d97706", glow: "rgba(245, 158, 11, 0.34)" };
  }
  if (classification === "smooth-approval") {
    return { core: "#34d399", mid: "#10b981", edge: "#059669", glow: "rgba(16, 185, 129, 0.36)" };
  }

  // Fallback to legacy DQS-driven logic
  if (dqs >= 70) {
    return { core: "#34d399", mid: "#10b981", edge: "#059669", glow: "rgba(16, 185, 129, 0.36)" };
  }
  if (dqs >= 50) {
    return { core: "#f59e0b", mid: "#fbbf24", edge: "#d97706", glow: "rgba(245, 158, 11, 0.34)" };
  }
  return { core: "#ef4444", mid: "#f87171", edge: "#b91c1c", glow: "rgba(239, 68, 68, 0.34)" };
}

function angleDistance(a: number, b: number): number {
  const raw = Math.atan2(Math.sin(a - b), Math.cos(a - b));
  return Math.abs(raw);
}

export function DecisionPulse({
  dqs,
  agentInfluence,
  thinkingAgents,
  agentPositions,
  runtimeActive = false,
  socraticMode = false,
  redTeamMode = false,
  classification,
  socraticTug = null,
  readinessScore,
  settlingMode = false,
  stableMode = false,
  freezeMode = false,
  previousRunPoints,
}: DecisionPulseProps) {
  const [time, setTime] = useState(0);
  const smoothedXRef = useRef<number[]>(Array.from({ length: POINTS }, (_, i) => CENTER + Math.cos((i / POINTS) * Math.PI * 2 - Math.PI / 2) * BASE_RADIUS));
  const smoothedYRef = useRef<number[]>(Array.from({ length: POINTS }, (_, i) => CENTER + Math.sin((i / POINTS) * Math.PI * 2 - Math.PI / 2) * BASE_RADIUS));

  useEffect(() => {
    if (freezeMode) {
      setTime(0);
      return;
    }
    let frameId = 0;
    const start = performance.now();
    const tick = (now: number) => {
      setTime((now - start) / 1000);
      frameId = window.requestAnimationFrame(tick);
    };
    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [freezeMode]);

  const normalizedInfluence = useMemo(() => {
    const values = new Array<number>(MAX_AGENTS).fill(0);
    for (let i = 0; i < MAX_AGENTS; i += 1) {
      values[i] = clamp01(agentInfluence[i] ?? 0);
    }
    return values;
  }, [agentInfluence]);

  const normalizedPositions = useMemo(() => {
    const values = new Array<[number, number, number]>(MAX_AGENTS).fill([0, 0, 0]);
    for (let i = 0; i < MAX_AGENTS; i += 1) {
      const [x = 0, y = 0, z = 0] = agentPositions?.[i] ?? [0, 0, 0];
      values[i] = [x, y, z];
    }
    return values;
  }, [agentPositions]);

  const conflict = useMemo(() => {
    const peak = Math.max(...normalizedInfluence);
    const avg = normalizedInfluence.reduce((sum, value) => sum + value, 0) / MAX_AGENTS;
    return clamp01(peak * 0.84 + avg * 0.46);
  }, [normalizedInfluence]);

  const socraticReadiness = clamp01((readinessScore ?? dqs) / 100);
  const palette = useMemo(() => getPalette(dqs, socraticMode, redTeamMode, classification), [dqs, redTeamMode, socraticMode, classification]);

  const { polygonPoints, pathData, facetPolygons, ghostPathData } = useMemo(() => {
    const points: Array<{ x: number; y: number; angle: number }> = [];
    const dynamicNoise = stableMode || freezeMode
      ? 0
      : runtimeActive
        ? redTeamMode
          ? (0.33 + conflict * 0.66) * (settlingMode ? 0.28 : 1)
          : (0.11 + conflict * 0.22) * (settlingMode ? 0.45 : 1)
        : 0.04;
    const socraticTugAngle = socraticTug ? Math.atan2(-socraticTug[1], socraticTug[0]) : null;
    const socraticTugStrength = socraticMode && socraticTug ? Math.min(0.42, Math.hypot(socraticTug[0], socraticTug[1]) * 0.55) : 0;

    for (let i = 0; i < POINTS; i += 1) {
      const angle = (i / POINTS) * Math.PI * 2 - Math.PI / 2;

      // Starting with BASE_RADIUS vector
      let targetX = Math.cos(angle) * BASE_RADIUS;
      let targetY = Math.sin(angle) * BASE_RADIUS;

      let thinkingJitter = 0;

      for (let j = 0; j < MAX_AGENTS; j += 1) {
        if (stableMode) {
          break;
        }
        const influence = normalizedInfluence[j];
        if (influence <= 0.001) continue;

        const [axRaw, ayRaw] = normalizedPositions[j];
        const ax = axRaw;
        const ay = -ayRaw; // convert to SVG Y-down space
        const len = Math.hypot(ax, ay);
        if (len <= 0.0001) continue;

        const agentAngle = Math.atan2(ay, ax);
        // Vector-based pull: pull toward the agent's specific vector
        const proximity = Math.pow(Math.cos(angle - agentAngle) * 0.5 + 0.5, 6.0);
        const thinkingBoost = thinkingAgents?.[j] ? 1.12 : 1;

        const pullMagnitude = influence * thinkingBoost * proximity * MAX_PULL * (0.3 + Math.min(1.2, len) * 0.28);
        targetX += Math.cos(agentAngle) * pullMagnitude;
        targetY += Math.sin(agentAngle) * pullMagnitude;

        if (runtimeActive && thinkingAgents?.[j]) {
          thinkingJitter += Math.sin(time * 14.0 + i + j * 0.35) * (0.012 + influence * 0.02);
        }
      }

      const waveStrength = stableMode || freezeMode
        ? 0.045
        : dynamicNoise;
      const waveVal = stableMode || freezeMode
        ? Math.sin(angle * 5) * 0.045 + Math.cos(angle * 10) * 0.02
        : Math.sin(time * (redTeamMode ? 2.6 : socraticMode ? 0.38 : 0.75) + angle * 2.0) * waveStrength;

      const slowSecondary = freezeMode ? 0 : Math.cos(time * 0.4 - angle) * (waveStrength * 0.5);
      const turbulence = stableMode || freezeMode
        ? 0
        : runtimeActive
          ? Math.sin(time * (redTeamMode ? 6.8 : 2.2) + angle * 2.6) * ((redTeamMode ? 0.018 + conflict * 0.054 : 0.006 + conflict * 0.018) * (settlingMode ? 0.25 : 1))
          : 0;

      const tugPull =
        stableMode || freezeMode || socraticTugAngle === null
          ? 0
          : Math.exp(-(angleDistance(angle, socraticTugAngle) ** 2) / (2 * (0.22 ** 2))) * socraticTugStrength;

      const totalExpansion = 1 + waveVal + slowSecondary + thinkingJitter + turbulence + tugPull;

      const finalTargetX = CENTER + targetX * totalExpansion;
      const finalTargetY = CENTER + targetY * totalExpansion;

      const smoothing = freezeMode
        ? 1
        : stableMode
          ? 0.24
          : runtimeActive
            ? redTeamMode
              ? settlingMode
                ? 0.08
                : 0.16
              : settlingMode
                ? 0.07
                : 0.1
            : socraticMode
              ? 0.07
              : 0.08;

      const previousX = smoothedXRef.current[i] ?? CENTER + Math.cos(angle) * BASE_RADIUS;
      const previousY = smoothedYRef.current[i] ?? CENTER + Math.sin(angle) * BASE_RADIUS;

      const x = previousX + (finalTargetX - previousX) * smoothing;
      const y = previousY + (finalTargetY - previousY) * smoothing;

      smoothedXRef.current[i] = x;
      smoothedYRef.current[i] = y;

      points.push({ x, y, angle });
    }

    const path = points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
      .join(" ");
    const closedPath = `${path} Z`;

    let ghostPath = "";
    if (previousRunPoints && previousRunPoints.length > 0) {
      ghostPath = previousRunPoints
        .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
        .join(" ") + " Z";
    }

    const facets: Array<{ points: string; opacity: number }> = [];
    for (let i = 0; i < points.length; i += 3) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const c = points[(i + 4) % points.length];
      const pulse = stableMode ? 0.18 : 0.12 + ((Math.sin(time * 0.5 + i) + 1) * 0.5) * 0.08 + conflict * 0.12;
      facets.push({
        points: `${CENTER},${CENTER} ${a.x.toFixed(2)},${a.y.toFixed(2)} ${b.x.toFixed(2)},${b.y.toFixed(2)}`,
        opacity: pulse,
      });
      facets.push({
        points: `${CENTER},${CENTER} ${b.x.toFixed(2)},${b.y.toFixed(2)} ${c.x.toFixed(2)},${c.y.toFixed(2)}`,
        opacity: pulse * 0.78,
      });
    }

    return { polygonPoints: points, pathData: closedPath, facetPolygons: facets, ghostPathData: ghostPath };
  }, [conflict, freezeMode, normalizedInfluence, normalizedPositions, redTeamMode, runtimeActive, settlingMode, socraticMode, socraticTug, stableMode, thinkingAgents, time, previousRunPoints]);

  return (
    <div className="pulse-core-three-shell" aria-hidden="true">
      <svg viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`} width="100%" height="100%">
        <defs>
          <radialGradient id="pulse-nucleus-gradient" cx="50%" cy="42%" r="64%">
            <stop offset="0%" stopColor={palette.core} stopOpacity="0.95" />
            <stop offset="58%" stopColor={palette.mid} stopOpacity="0.72" />
            <stop offset="100%" stopColor={palette.edge} stopOpacity="0.86" />
          </radialGradient>
          <radialGradient id="pulse-nucleus-glow" cx="50%" cy="50%" r="62%">
            <stop offset="0%" stopColor={palette.glow} stopOpacity="0.6" />
            <stop offset="100%" stopColor={palette.glow} stopOpacity="0" />
          </radialGradient>
          <filter id="pulse-nucleus-shadow" x="-60%" y="-60%" width="220%" height="220%">
            <feDropShadow dx="0" dy="12" stdDeviation="10" floodColor="rgba(15,23,42,0.24)" />
          </filter>
          <filter id="pulse-nucleus-aura" x="-80%" y="-80%" width="260%" height="260%">
            {runtimeActive ? (
              <>
                <feGaussianBlur in="SourceGraphic" stdDeviation={1.2 + conflict * 0.8} result="blur" />
                <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" result="noise" />
                <feDisplacementMap in="blur" in2="noise" scale={4 + conflict * 8} xChannelSelector="R" yChannelSelector="G" result="displaced" />
                <feColorMatrix
                  in="displaced"
                  type="matrix"
                  values="1 0 0 0 0  0 0.9 0 0 0  0 0 1 0 0  0 0 0 0.8 0"
                  result="tint"
                />
              </>
            ) : (
              <>
                <feGaussianBlur in="SourceGraphic" stdDeviation={4.2 + socraticReadiness * 2.4} result="blur" />
                <feColorMatrix
                  in="blur"
                  type="matrix"
                  values="1 0 0 0 0  0 0.8 0 0 0  0 0 1 0 0  0 0 0 0.9 0"
                  result="tint"
                />
              </>
            )}
            <feComposite in="tint" in2="SourceAlpha" operator="in" result="aura" />
            <feMerge>
              <feMergeNode in="aura" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle cx={CENTER} cy={CENTER + 16} r={86 + conflict * 30} fill="url(#pulse-nucleus-glow)" />

        {ghostPathData ? (
          <path
            d={ghostPathData}
            fill="none"
            stroke="rgba(148, 163, 184, 0.25)"
            strokeWidth="1.2"
            strokeDasharray="4 3"
          />
        ) : null}

        {runtimeActive ? (
          <path
            d={pathData}
            fill="url(#pulse-nucleus-gradient)"
            opacity={socraticMode ? 0.42 + socraticReadiness * 0.42 : 0.5 + conflict * 0.35}
            filter="url(#pulse-nucleus-aura)"
          />
        ) : null}
        <path
          d={pathData}
          fill="url(#pulse-nucleus-gradient)"
          stroke={palette.edge}
          strokeWidth={2.2 + (socraticMode ? socraticReadiness * 0.55 : 0)}
          filter="url(#pulse-nucleus-shadow)"
        />

        {facetPolygons.map((facet, index) => (
          <polygon
            key={`facet-${index}`}
            points={facet.points}
            fill="rgba(255,255,255,0.28)"
            opacity={facet.opacity}
            stroke="rgba(255,255,255,0.1)"
            strokeWidth={0.5}
          />
        ))}

        {polygonPoints.map((point, index) => (
          <line
            key={`vein-${index}`}
            x1={CENTER}
            y1={CENTER}
            x2={point.x}
            y2={point.y}
            stroke="rgba(30,41,59,0.1)"
            strokeWidth={0.7}
            opacity={0.3 + conflict * 0.4}
          />
        ))}
      </svg>
    </div>
  );
}
