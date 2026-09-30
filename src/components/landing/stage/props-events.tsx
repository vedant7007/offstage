"use client";

import * as React from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import type { Group } from "three";
import { CUE_BLUE, CURTAIN_RED, EVENT_TYPES, TUNGSTEN } from "../chapters";
import { bump, local, stage, window01 } from "../scroll-store";

const PAPER = "#e9e0d2";
const DARK = "#2a2622";

/**
 * Any event: six quick prop arrangements on the stage, one per event type, cross-blended by
 * scroll in step with the label beside the box.
 */
export function EventSets() {
  const group = React.useRef<Group>(null);
  const sets = React.useRef<(Group | null)[]>([]);

  useFrame(() => {
    const p = stage.p;
    const vis = bump(p, 8.5, 8.95, 9.65, 10.05);
    if (!group.current) return;
    group.current.visible = vis > 0.002;
    const sub = window01(local(p, 9), 0.05, 0.75) * EVENT_TYPES.length;
    sets.current.forEach((g, k) => {
      if (!g) return;
      const w = Math.max(0, 1 - Math.abs(sub - (k + 0.5)) * 1.6) * vis;
      g.visible = w > 0.001;
      g.scale.setScalar(Math.max(0.0001, w));
      g.position.y = (1 - w) * -0.4;
    });
  });

  return (
    <group ref={group}>
      {/* Tech fest: two stalls, a big screen, a banner */}
      <group
        ref={(g) => {
          sets.current[0] = g;
        }}
      >
        <mesh position={[-1.7, 0.25, -0.4]} castShadow>
          <boxGeometry args={[1.3, 0.5, 0.7]} />
          <meshStandardMaterial color={PAPER} roughness={0.85} />
        </mesh>
        <mesh position={[1.7, 0.25, -0.4]} castShadow>
          <boxGeometry args={[1.3, 0.5, 0.7]} />
          <meshStandardMaterial color={PAPER} roughness={0.85} />
        </mesh>
        <mesh position={[0, 1.1, -1.7]}>
          <boxGeometry args={[1.9, 1.05, 0.06]} />
          <meshStandardMaterial color="#111" emissive={CUE_BLUE} emissiveIntensity={0.7} roughness={0.4} />
        </mesh>
        <mesh position={[0, 2.35, -1.9]}>
          <boxGeometry args={[3.2, 0.42, 0.04]} />
          <meshStandardMaterial color={TUNGSTEN} roughness={0.7} />
        </mesh>
      </group>

      {/* Hackathon: four tables with laptops */}
      <group
        ref={(g) => {
          sets.current[1] = g;
        }}
      >
        {[-1.6, -0.55, 0.55, 1.6].map((x) => (
          <group key={x} position-x={x}>
            <mesh position-y={0.42} castShadow>
              <boxGeometry args={[0.9, 0.06, 1.6]} />
              <meshStandardMaterial color={PAPER} roughness={0.8} />
            </mesh>
            {[-0.5, 0.1, 0.6].map((z) => (
              <group key={z} position={[0, 0.46, z]}>
                <mesh>
                  <boxGeometry args={[0.24, 0.02, 0.18]} />
                  <meshStandardMaterial color={DARK} roughness={0.5} />
                </mesh>
                <mesh position={[0, 0.1, -0.09]} rotation-x={-0.25}>
                  <planeGeometry args={[0.24, 0.16]} />
                  <meshStandardMaterial color="#111" emissive={CUE_BLUE} emissiveIntensity={0.9} side={2} />
                </mesh>
              </group>
            ))}
          </group>
        ))}
      </group>

      {/* Wedding: a mandap and two rings */}
      <group
        ref={(g) => {
          sets.current[2] = g;
        }}
      >
        {[-1, 1].map((x) =>
          [-1, 1].map((z) => (
            <mesh key={`${x}${z}`} position={[x * 0.95, 0.8, z * 0.95 - 0.3]} castShadow>
              <cylinderGeometry args={[0.045, 0.045, 1.6, 12]} />
              <meshStandardMaterial color="#d9a441" metalness={0.7} roughness={0.35} />
            </mesh>
          )),
        )}
        <mesh position={[0, 1.66, -0.3]} castShadow>
          <boxGeometry args={[2.3, 0.08, 2.3]} />
          <meshStandardMaterial color={CURTAIN_RED} roughness={0.8} />
        </mesh>
        <mesh position={[-0.28, 0.9, 0.2]} rotation={[0.4, 0.3, 0]}>
          <torusGeometry args={[0.22, 0.03, 12, 40]} />
          <meshStandardMaterial color="#e2b453" metalness={0.95} roughness={0.25} />
        </mesh>
        <mesh position={[0.28, 0.9, 0.2]} rotation={[0.4, -0.3, 0]}>
          <torusGeometry args={[0.22, 0.03, 12, 40]} />
          <meshStandardMaterial color="#e2b453" metalness={0.95} roughness={0.25} />
        </mesh>
      </group>

      {/* Marathon: a start gate and cones */}
      <group
        ref={(g) => {
          sets.current[3] = g;
        }}
      >
        {[-1.5, 1.5].map((x) => (
          <mesh key={x} position={[x, 1.1, 0.8]} castShadow>
            <cylinderGeometry args={[0.05, 0.05, 2.2, 12]} />
            <meshStandardMaterial color={DARK} roughness={0.5} metalness={0.3} />
          </mesh>
        ))}
        <mesh position={[0, 2.2, 0.8]}>
          <boxGeometry args={[3.2, 0.34, 0.08]} />
          <meshStandardMaterial color={TUNGSTEN} roughness={0.7} />
        </mesh>
        {[-1.6, -1.0, -0.4, 0.2].map((z) =>
          [-0.7, 0.7].map((x) => (
            <mesh key={`${x}${z}`} position={[x, 0.12, z]} castShadow>
              <coneGeometry args={[0.09, 0.24, 12]} />
              <meshStandardMaterial color="#e2612f" roughness={0.6} />
            </mesh>
          )),
        )}
      </group>

      {/* Charity drive: a stall with an awning, donation boxes, a tall banner */}
      <group
        ref={(g) => {
          sets.current[4] = g;
        }}
      >
        <mesh position={[0, 0.36, 0]} castShadow>
          <boxGeometry args={[1.8, 0.72, 0.7]} />
          <meshStandardMaterial color={PAPER} roughness={0.85} />
        </mesh>
        <mesh position={[0, 1.55, 0.1]} rotation-x={0.28} castShadow>
          <boxGeometry args={[2.0, 0.05, 1.1]} />
          <meshStandardMaterial color={CURTAIN_RED} roughness={0.8} />
        </mesh>
        {[-0.55, 0, 0.55].map((x) => (
          <mesh key={x} position={[x, 0.15, 0.85]} castShadow>
            <boxGeometry args={[0.3, 0.3, 0.3]} />
            <meshStandardMaterial color="#b98a5a" roughness={0.9} />
          </mesh>
        ))}
        <mesh position={[1.7, 0.95, -0.6]} castShadow>
          <boxGeometry args={[0.5, 1.9, 0.04]} />
          <meshStandardMaterial color={TUNGSTEN} roughness={0.7} />
        </mesh>
      </group>

      {/* Product launch: a pedestal, the product, a cone of light */}
      <group
        ref={(g) => {
          sets.current[5] = g;
        }}
      >
        <mesh position={[0, 0.27, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.55, 0.6, 0.54, 40]} />
          <meshStandardMaterial color="#1c1a19" roughness={0.25} metalness={0.5} />
        </mesh>
        <RoundedBox args={[0.5, 0.5, 0.5]} radius={0.06} smoothness={4} position={[0, 0.82, 0]} castShadow>
          <meshStandardMaterial color={TUNGSTEN} metalness={0.85} roughness={0.3} />
        </RoundedBox>
        <mesh position={[0, 2.0, 0]} rotation-x={Math.PI}>
          <coneGeometry args={[0.95, 2.6, 32, 1, true]} />
          <meshBasicMaterial
            color={[0.5, 0.4, 0.25]}
            transparent
            opacity={0.28}
            depthWrite={false}
            blending={2}
            side={2}
            toneMapped={false}
          />
        </mesh>
      </group>
    </group>
  );
}
