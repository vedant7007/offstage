"use client";

import * as React from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import { Bloom, EffectComposer, Noise, SMAA, Vignette } from "@react-three/postprocessing";
import { stage } from "./scroll-store";
import { Projector } from "./stage/projector";
import { Rig } from "./stage/rig";
import { Theatre } from "./stage/theatre";
import { CommanderScreen, Crew, Phones } from "./stage/props-early";
import { ApprovalButton, Beams, Venue } from "./stage/props-venue";
import { EventSets } from "./stage/props-events";

/**
 * The one canvas behind the whole page. Mounted once, never unmounted; everything in it is
 * driven by the master scroll progress through the rig and the props.
 */
export default function StageCanvas() {
  const [lite] = React.useState(() => {
    stage.mobile = window.matchMedia("(max-width: 767px)").matches;
    stage.lite = stage.mobile || window.innerWidth < 1024;
    return stage.lite;
  });

  return (
    <Canvas
      dpr={[1, 1.5]}
      shadows="percentage"
      gl={{ antialias: false, powerPreference: "high-performance", stencil: false }}
      camera={{ fov: 24, near: 0.1, far: 140, position: [0, 3, 22] }}
      style={{ position: "absolute", inset: 0 }}
    >
      <color attach="background" args={["#0f0e0d"]} />
      <fog attach="fog" args={["#0f0e0d", 34, 80]} />
      <Rig />
      <Projector />
      <Theatre />
      <Phones />
      <CommanderScreen />
      <Crew />
      <Venue />
      <ApprovalButton />
      <Beams />
      <EventSets />
      <Environment resolution={64} environmentIntensity={0.35}>
        <Lightformer
          intensity={1.2}
          color="#ffd9a3"
          position={[0, 6, 2]}
          rotation-x={Math.PI / 2}
          scale={[8, 4, 1]}
        />
        <Lightformer intensity={0.5} color="#4da3ff" position={[0, 2.5, -8]} scale={[10, 3, 1]} />
        <Lightformer
          intensity={0.25}
          color="#ffffff"
          position={[-8, 3, 0]}
          rotation-y={Math.PI / 2}
          scale={[6, 2, 1]}
        />
      </Environment>
      <EffectComposer multisampling={0} enableNormalPass={false}>
        {lite ? (
          <SMAA />
        ) : (
          <>
            <Bloom
              mipmapBlur
              luminanceThreshold={1.0}
              luminanceSmoothing={0.15}
              intensity={0.55}
              radius={0.55}
            />
            <Noise opacity={0.05} premultiply />
            <Vignette eskil={false} offset={0.2} darkness={0.7} />
            <SMAA />
          </>
        )}
      </EffectComposer>
    </Canvas>
  );
}
