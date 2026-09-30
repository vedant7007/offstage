"use client";

/* eslint-disable react-hooks/immutability -- three.js objects are mutated in
   useFrame callbacks, which run outside render; the compiler rules cannot tell that apart. */

import * as React from "react";
import { useFrame } from "@react-three/fiber";
import { ContactShadows, MeshReflectorMaterial } from "@react-three/drei";
import {
  ExtrudeGeometry,
  type Mesh,
  MeshPhysicalMaterial,
  type MeshStandardMaterial,
  Path,
  PlaneGeometry,
  RepeatWrapping,
  Shape,
  type WebGLProgramParametersWithUniforms,
} from "three";
import { RULE_PANELS, TUNGSTEN } from "../chapters";
import { bump, local, stage, window01 } from "../scroll-store";
import { makeLabel, makeWood } from "./labels";
import { live } from "./scene-state";

const WOOD = "#3a2418";
const ARCH_Z = 2.0;

/** The proscenium: a dark wood frame with a rounded opening and a soft bevel. */
function prosceniumGeometry() {
  const shape = new Shape();
  shape.moveTo(-3.8, -0.05);
  shape.lineTo(3.8, -0.05);
  shape.lineTo(3.8, 4.7);
  shape.lineTo(-3.8, 4.7);
  shape.closePath();
  const hole = new Path();
  hole.moveTo(-2.9, -0.05);
  hole.lineTo(2.9, -0.05);
  hole.lineTo(2.9, 3.2);
  hole.absarc(2.4, 3.2, 0.5, 0, Math.PI / 2, false);
  hole.lineTo(-2.4, 3.7);
  hole.absarc(-2.4, 3.2, 0.5, Math.PI / 2, Math.PI, false);
  hole.lineTo(-2.9, -0.05);
  shape.holes.push(hole);
  const geo = new ExtrudeGeometry(shape, {
    depth: 0.4,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.04,
    bevelSegments: 3,
  });
  return geo;
}

export function Theatre() {
  const wood = React.useMemo(() => {
    const t = makeWood();
    t.wrapS = t.wrapT = RepeatWrapping;
    t.repeat.set(1.4, 1);
    return t;
  }, []);
  const arch = React.useMemo(() => prosceniumGeometry(), []);

  return (
    <group>
      {/* Plinth with the stage floor on top */}
      <mesh position={[0, -0.3, 0.1]} receiveShadow castShadow>
        <boxGeometry args={[7.8, 0.6, 5.0]} />
        <meshStandardMaterial map={wood} color="#b89a7a" roughness={0.8} metalness={0} />
      </mesh>
      {/* Back and side walls */}
      <mesh position={[0, 2.3, -2.35]} receiveShadow>
        <planeGeometry args={[7.8, 4.7]} />
        <meshStandardMaterial color="#17120f" roughness={0.95} />
      </mesh>
      <mesh position={[-3.85, 2.3, -0.2]} rotation-y={Math.PI / 2} receiveShadow>
        <planeGeometry args={[4.4, 4.7]} />
        <meshStandardMaterial color="#17120f" roughness={0.95} />
      </mesh>
      <mesh position={[3.85, 2.3, -0.2]} rotation-y={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[4.4, 4.7]} />
        <meshStandardMaterial color="#17120f" roughness={0.95} />
      </mesh>
      {/* Proscenium */}
      <mesh geometry={arch} position={[0, 0, ARCH_Z]} castShadow receiveShadow>
        <meshStandardMaterial color={WOOD} roughness={0.62} metalness={0.05} />
      </mesh>
      <Practicals />
      <RulePanels />
      <Curtain side={-1} />
      <Curtain side={1} />
      <VoidFloor />
    </group>
  );
}

/** Small bulbs along the arch: the only things that bloom, apart from a few emissive props. */
function Practicals() {
  const spots = React.useMemo(() => {
    const out: [number, number, number][] = [];
    for (let x = -3.3; x <= 3.31; x += 0.6) out.push([x, 4.55, ARCH_Z + 0.48]);
    for (let y = 0.5; y <= 3.5; y += 0.5) {
      out.push([-3.4, y, ARCH_Z + 0.48]);
      out.push([3.4, y, ARCH_Z + 0.48]);
    }
    return out;
  }, []);
  return (
    <group>
      {spots.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.045, 12, 8]} />
          <meshStandardMaterial
            color="#ffd9a0"
            emissive={TUNGSTEN}
            emissiveIntensity={3.2}
            roughness={0.4}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/** Four backlit panels on the arch header, lit one by one in the rule chapter. */
function RulePanels() {
  const mats = React.useRef<(MeshStandardMaterial | null)[]>([]);
  React.useEffect(() => {
    let alive = true;
    document.fonts?.ready.then(() => {
      if (!alive) return;
      RULE_PANELS.forEach((t, k) => {
        const m = mats.current[k];
        if (!m) return;
        m.emissiveMap = makeLabel({
          title: t,
          width: 640,
          height: 200,
          bg: "#f3ede3",
          fg: "#1a1209",
          font: "display",
          size: 96,
        });
        m.needsUpdate = true;
      });
    });
    return () => {
      alive = false;
    };
  }, []);

  useFrame(() => {
    const f = local(stage.p, 8);
    const vis = bump(stage.p, 7.5, 7.95, 8.75, 9.2);
    mats.current.forEach((m, k) => {
      if (!m) return;
      const lit = window01(f, 0.1 + k * 0.14, 0.24 + k * 0.14) * vis;
      // Unlit panels sit at 0.005: in sRGB anything higher reads as grey paper.
      m.emissiveIntensity = 0.005 + lit * 1.6;
    });
  });

  return (
    <group>
      {RULE_PANELS.map((t, k) => (
        <mesh key={t} position={[-2.7 + k * 1.8, 4.18, ARCH_Z + 0.462]}>
          <planeGeometry args={[1.6, 0.5]} />
          <meshStandardMaterial
            ref={(m) => {
              mats.current[k] = m;
            }}
            color="#050505"
            emissive="#ffffff"
            emissiveIntensity={0.005}
            roughness={0.5}
          />
        </mesh>
      ))}
    </group>
  );
}

const CURTAIN_W = 2.95;
const CURTAIN_H = 3.75;

/**
 * One velvet curtain, pivoting at its outer edge. A vertex shader gives it folds that tighten
 * as it opens, and a slow sway; the normal is recomputed from the fold so the light reads it.
 */
function Curtain({ side }: { side: -1 | 1 }) {
  const uniforms = React.useMemo(() => ({ uOpen: { value: 0 }, uTime: { value: 0 } }), []);
  const material = React.useMemo(() => {
    const m = new MeshPhysicalMaterial({
      color: "#7e1f2c",
      roughness: 0.92,
      metalness: 0,
      sheen: 1,
      sheenColor: "#d8556a",
      sheenRoughness: 0.55,
      side: 2,
    });
    m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
      shader.uniforms.uOpen = uniforms.uOpen;
      shader.uniforms.uTime = uniforms.uTime;
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
          uniform float uOpen;
          uniform float uTime;
          const float CH = ${CURTAIN_H.toFixed(3)};
          float foldPhase(vec3 p, float hang, float freq) { return p.x * freq + hang * 1.4 + sin(uTime * 0.35 + p.x) * 0.15; }`,
        )
        .replace(
          "#include <beginnormal_vertex>",
          `float hang = 0.5 - position.y / CH;
          float sx = mix(1.0, 0.24, uOpen);
          float freq = mix(6.5, 21.0, uOpen);
          float amp = mix(0.055, 0.13, uOpen) * (0.3 + 0.7 * hang);
          float dfdx = cos(foldPhase(position, hang, freq)) * amp * freq / sx;
          vec3 objectNormal = normalize(vec3(-dfdx, 0.0, 1.0));
          #ifdef USE_TANGENT
          vec3 objectTangent = vec3(tangent.xyz);
          #endif`,
        )
        .replace(
          "#include <begin_vertex>",
          `vec3 transformed = vec3(position);
          transformed.x *= sx;
          float sway = sin(uTime * 0.7 + position.x * 1.5) * 0.025 * hang;
          transformed.z += sin(foldPhase(position, hang, freq)) * amp + sway;`,
        );
    };
    m.customProgramCacheKey = () => "offstage-curtain";
    return m;
  }, [uniforms]);

  const geometry = React.useMemo(() => {
    const g = new PlaneGeometry(CURTAIN_W, CURTAIN_H, 28, 36);
    g.translate(CURTAIN_W / 2, 0, 0);
    return g;
  }, []);

  useFrame(() => {
    uniforms.uOpen.value = live.curtain;
    uniforms.uTime.value = live.time;
  });

  return (
    <mesh
      geometry={geometry}
      material={material}
      position={[side * CURTAIN_W, CURTAIN_H / 2, ARCH_Z - 0.25]}
      scale={[-side, 1, 1]}
    />
  );
}

/** The dark void the box sits in, with a soft reflection of the box and its lights. */
function VoidFloor() {
  const ref = React.useRef<Mesh>(null);
  return (
    <group position-y={-0.6}>
      <mesh ref={ref} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[80, 80]} />
        {stage.lite ? (
          <meshStandardMaterial color="#0f0e0d" roughness={0.9} />
        ) : (
          <MeshReflectorMaterial
            blur={[400, 100]}
            resolution={512}
            mixBlur={1}
            mixStrength={0.55}
            roughness={1}
            depthScale={1.1}
            minDepthThreshold={0.4}
            maxDepthThreshold={1.4}
            color="#0f0e0d"
            metalness={0.3}
            mirror={0.35}
          />
        )}
      </mesh>
      <ContactShadows
        position={[0, 0.005, 0.1]}
        opacity={0.7}
        scale={16}
        blur={2.6}
        far={2.2}
        resolution={512}
        frames={1}
      />
    </group>
  );
}
