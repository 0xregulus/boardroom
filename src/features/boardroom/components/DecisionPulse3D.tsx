import React, { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Icosahedron } from "@react-three/drei";
import * as THREE from "three";

interface DecisionPulse3DProps {
  dqs: number;
  agentInfluence: number[]; // Array of 8 values (0.0 to 1.0)
}

const AGENT_ANCHORS: ReadonlyArray<[number, number, number]> = [
  [0.0, 1.45, 0.2],    // CEO (Top)
  [1.25, 0.5, 0.1],    // CFO (Top Right)
  [1.15, -0.75, 0.2],  // CTO (Bottom Right)
  [0.0, -1.4, 0.35],   // Compliance (Bottom)
  [-1.15, -0.75, 0.2], // Pre-Mortem (Bottom Left)
  [-1.25, 0.5, 0.1],   // Resource Competitor (Top Left)
  [0.0, 0.0, 1.35],    // Risk Agent (Front)
  [0.0, 0.0, -1.35],   // Devil's Advocate (Rear)
];

const vertexShader = `
  uniform float uTime;
  uniform vec3 uAgentPositions[8];
  uniform float uAgentInfluence[8];
  uniform float uConflict;

  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  varying float vConflict;
  varying float vHeat;

  void main() {
    vec3 newPosition = position;
    float totalInfluence = 0.0;
    float localHeat = 0.0;
    vec3 radial = normalize(position);

    for (int i = 0; i < 8; i++) {
      vec3 anchorDir = normalize(uAgentPositions[i]);
      float dist = distance(position, uAgentPositions[i]);
      
      // AGGRESSIVE SPIKE: High power (6.0) ensures only vertices facing the agent move
      float facing = max(dot(radial, anchorDir), 0.0);
      float influence = uAgentInfluence[i] * pow(facing, 16.0) * exp(-pow(dist * 0.5, 2.0));
      
      // THE TUG: Stronger linear displacement
      newPosition += anchorDir * influence * 1.6;

      // STRESS JITTER: High-frequency vibration for agents with influence > 0.5
      if (uAgentInfluence[i] > 0.5) {
        float jitter = sin(uTime * 35.0 + float(i) * 2.0) * 0.04 * uAgentInfluence[i];
        newPosition += normal * jitter;
        localHeat += influence;
      }
      
      totalInfluence += influence;
    }

    // Baseline "Breathing" controlled by overall conflict
    float breathing = sin(uTime * 2.5) * 0.015 * uConflict;
    newPosition += normal * breathing;

    vec4 worldPosition = modelMatrix * vec4(newPosition, 1.0);
    vWorldPosition = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    
    vConflict = clamp(totalInfluence * 1.2 + uConflict * 0.4, 0.0, 1.0);
    vHeat = clamp(localHeat * 3.0, 0.0, 1.0);
    
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const fragmentShader = `
  uniform float uConflict;
  uniform vec3 uBaseColor;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  varying float vConflict;
  varying float vHeat;

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPosition);
    
    // Multi-directional lighting to highlight facets
    vec3 L1 = normalize(vec3(0.5, 0.8, 0.5));
    vec3 L2 = normalize(vec3(-0.7, 0.3, -0.4));

    float diff1 = max(dot(N, L1), 0.0);
    float diff2 = max(dot(N, L2), 0.0);
    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    float spec = pow(max(dot(reflect(-L1, N), V), 0.0), 40.0);

    // Dynamic Color Mapping
    vec3 warningColor = vec3(0.75, 0.35, 0.2); // Muted Burnt Orange
    vec3 heatGlow = vec3(1.0, 0.7, 0.4);      // Incandescent Yellow
    
    vec3 color = mix(uBaseColor, warningColor, vConflict);
    vec3 finalColor = mix(color, heatGlow, vHeat * 0.7);

    // Shading assembly
    vec3 lit = finalColor * (0.3 + diff1 * 0.5 + diff2 * 0.2);
    lit += vec3(1.0) * fresnel * (0.2 + vHeat * 0.4); // Edge glow
    lit += vec3(1.0) * spec * (0.2 + vHeat * 0.5);    // Sharp highlights

    gl_FragColor = vec4(lit, 1.0);
  }
`;

function getBaseColor(dqs: number): string {
  if (dqs >= 70) return "#a7f3d0";
  if (dqs >= 50) return "#ea580c";
  return "#dc2626";
}

function PulseNucleus({ dqs, agentInfluence }: DecisionPulse3DProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const agentPositions = useMemo(() => AGENT_ANCHORS.map(p => new THREE.Vector3(...p)), []);

  const influenceArray = useMemo(() =>
    agentInfluence.map(v => Math.max(0, Math.min(1, v ?? 0))),
    [agentInfluence]);

  const conflictLevel = useMemo(() => {
    const peak = Math.max(...influenceArray);
    return Math.min(1, peak * 0.8 + (influenceArray.reduce((a, b) => a + b, 0) / 8) * 0.4);
  }, [influenceArray]);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uBaseColor: { value: new THREE.Color(getBaseColor(dqs)) },
    uAgentPositions: { value: agentPositions },
    uAgentInfluence: { value: influenceArray },
    uConflict: { value: conflictLevel },
  }), [agentPositions, dqs, influenceArray, conflictLevel]);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const material = meshRef.current.material as THREE.ShaderMaterial;
    material.uniforms.uTime.value = clock.getElapsedTime();

    // Smoothly rotate to show facets
    meshRef.current.rotation.y += 0.006;
    meshRef.current.rotation.x = Math.sin(clock.getElapsedTime() * 0.4) * 0.15;
  });

  return (
    <Icosahedron args={[1.15, 1]} ref={meshRef}>
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
      />
    </Icosahedron>
  );
}

export function DecisionPulse3D({ dqs, agentInfluence }: DecisionPulse3DProps) {
  return (
    <div className="w-full h-full min-h-[550px] bg-[#F9F8F6]">
      <Canvas dpr={[1, 2]} camera={{ position: [0, 0, 3.4], fov: 42 }}>
        <ambientLight intensity={0.4} />
        <pointLight position={[10, 10, 10]} intensity={1.2} />
        <PulseNucleus dqs={dqs} agentInfluence={agentInfluence} />
      </Canvas>
    </div>
  );
}
