import { useEffect, useMemo, useRef, useState } from "react";

interface DecisionPulseProps {
  dqs: number;
  agentInfluence: number[];
  thinkingAgents?: boolean[];
  agentPositions?: Array<[number, number, number]>;
  runtimeActive?: boolean;
}

const MAX_AGENTS = 12;
const VIEWBOX_SIZE = 260;
const CENTER = VIEWBOX_SIZE / 2;
const BASE_RADIUS = 78;
const POINTS = 30;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function getPalette(dqs: number): { core: string; edge: string; glow: string } {
  if (dqs >= 70) {
    return { core: "#34d399", edge: "#059669", glow: "rgba(16, 185, 129, 0.36)" };
  }
  if (dqs >= 50) {
    return { core: "#f59e0b", edge: "#d97706", glow: "rgba(245, 158, 11, 0.34)" };
  }
  return { core: "#ef4444", edge: "#b91c1c", glow: "rgba(239, 68, 68, 0.34)" };
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
}: DecisionPulseProps) {
  const [time, setTime] = useState(0);
  const smoothedRadiiRef = useRef<number[]>(Array.from({ length: POINTS }, () => BASE_RADIUS));

  useEffect(() => {
    let frameId = 0;
    const start = performance.now();
    const tick = (now: number) => {
      setTime((now - start) / 1000);
      frameId = window.requestAnimationFrame(tick);
    };
    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, []);

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

  const palette = useMemo(() => getPalette(dqs), [dqs]);

  const { polygonPoints, pathData, facetPolygons } = useMemo(() => {
    const points: Array<{ x: number; y: number; angle: number }> = [];
    const sigma = 0.22;
    const dynamicNoise = runtimeActive ? (0.11 + conflict * 0.22) : 0.04;

    for (let i = 0; i < POINTS; i += 1) {
      const angle = (i / POINTS) * Math.PI * 2 - Math.PI / 2;
      let pull = 0;
      let thinkingJitter = 0;

      for (let j = 0; j < MAX_AGENTS; j += 1) {
        const influence = normalizedInfluence[j];
        if (influence <= 0.001) continue;

        const [axRaw, ayRaw] = normalizedPositions[j];
        const ax = axRaw;
        const ay = -ayRaw; // convert to SVG Y-down space
        const len = Math.hypot(ax, ay);
        if (len <= 0.0001) continue;

        const agentAngle = Math.atan2(ay, ax);
        const dist = angleDistance(angle, agentAngle);
        const proximity = Math.pow(Math.exp(-(dist ** 2) / (2 * sigma * sigma)), 4.0);
        const thinkingBoost = thinkingAgents?.[j] ? 1.12 : 1;
        pull += influence * thinkingBoost * proximity * (0.3 + Math.min(1.2, len) * 0.28);

        if (runtimeActive && thinkingAgents?.[j]) {
          thinkingJitter += Math.sin(time * 14.0 + i + j * 0.35) * (0.012 + influence * 0.02);
        }
      }

      const baseWave = Math.sin(time * 0.75 + angle * 2.0) * dynamicNoise;
      const slowSecondary = Math.cos(time * 0.4 - angle) * (dynamicNoise * 0.5);
      const turbulence = runtimeActive ? Math.sin(time * 2.2 + angle * 2.6) * (0.006 + conflict * 0.018) : 0;
      const radiusScale = 1 + pull + baseWave + slowSecondary + thinkingJitter + turbulence;
      const targetRadius = BASE_RADIUS * Math.max(0.5, Math.min(2.0, radiusScale));
      const previousRadius = smoothedRadiiRef.current[i] ?? BASE_RADIUS;
      const smoothing = runtimeActive ? 0.1 : 0.08;
      const radius = previousRadius + (targetRadius - previousRadius) * smoothing;
      smoothedRadiiRef.current[i] = radius;
      const x = CENTER + Math.cos(angle) * radius;
      const y = CENTER + Math.sin(angle) * radius;
      points.push({ x, y, angle });
    }

    const path = points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
      .join(" ");
    const closedPath = `${path} Z`;

    const facets: Array<{ points: string; opacity: number }> = [];
    for (let i = 0; i < points.length; i += 3) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const c = points[(i + 4) % points.length];
      const pulse = 0.12 + ((Math.sin(time * 0.5 + i) + 1) * 0.5) * 0.08 + conflict * 0.12;
      facets.push({
        points: `${CENTER},${CENTER} ${a.x.toFixed(2)},${a.y.toFixed(2)} ${b.x.toFixed(2)},${b.y.toFixed(2)}`,
        opacity: pulse,
      });
      facets.push({
        points: `${CENTER},${CENTER} ${b.x.toFixed(2)},${b.y.toFixed(2)} ${c.x.toFixed(2)},${c.y.toFixed(2)}`,
        opacity: pulse * 0.78,
      });
    }

    return { polygonPoints: points, pathData: closedPath, facetPolygons: facets };
  }, [conflict, normalizedInfluence, normalizedPositions, runtimeActive, thinkingAgents, time]);

  return (
    <div className="pulse-core-three-shell" aria-hidden="true">
      <svg viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`} width="100%" height="100%">
        <defs>
          <radialGradient id="pulse-nucleus-gradient" cx="50%" cy="42%" r="64%">
            <stop offset="0%" stopColor={palette.core} stopOpacity="0.95" />
            <stop offset="58%" stopColor="#7c3aed" stopOpacity="0.72" />
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
            <feGaussianBlur in="SourceGraphic" stdDeviation={runtimeActive ? 4.2 + conflict * 2.4 : 1.8} result="blur" />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="1 0 0 0 0  0 0.9 0 0 0  0 0 1 0 0  0 0 0 0.9 0"
              result="tint"
            />
            <feComposite in="tint" in2="SourceAlpha" operator="in" result="aura" />
            <feMerge>
              <feMergeNode in="aura" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle cx={CENTER} cy={CENTER + 16} r={86 + conflict * 30} fill="url(#pulse-nucleus-glow)" />
        {runtimeActive ? (
          <path
            d={pathData}
            fill="url(#pulse-nucleus-gradient)"
            opacity={0.5 + conflict * 0.35}
            filter="url(#pulse-nucleus-aura)"
          />
        ) : null}
        <path d={pathData} fill="url(#pulse-nucleus-gradient)" stroke={palette.edge} strokeWidth={2.2} filter="url(#pulse-nucleus-shadow)" />

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
