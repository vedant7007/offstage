"use client";

/* eslint-disable react-hooks/immutability -- shader uniforms are mutated in useFrame, outside render. */

import * as React from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { MultiplyBlending, type Object3D } from "three";
import { useFrame } from "@react-three/fiber";
import { live } from "./stage/scene-state";
import { Environment, Lightformer, PerformanceMonitor, ScreenQuad } from "@react-three/drei";
import { Bloom, EffectComposer, Noise, SMAA, Vignette } from "@react-three/postprocessing";
import { stage } from "./scroll-store";
import { Projector } from "./stage/projector";
import { Rig } from "./stage/rig";
import { Theatre } from "./stage/theatre";
import { CommanderScreen, Crew, Phones } from "./stage/props-early";
import { ApprovalButton, Beams, Venue } from "./stage/props-venue";
import { EventSets } from "./stage/props-events";

/**
 * Whether this GPU can afford full-screen post passes at 1440x900. Integrated and mobile parts
 * drop from about 47 to 19 frames a second with the composer on, so they get halos and a CSS
 * grain instead (measured on an Intel UHD laptop, see docs/landing-shots/fps.json).
 */
function strongGpu() {
  // The cheap tier also skips the spotlight shadow map, fog and image-based lighting; the box
  // keeps its contact shadow. Measured: 19 fps with everything on, 57 fps this way.
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    const renderer = info ? String(gl!.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return !/intel|swiftshader|llvmpipe|mali|adreno|powervr|videocore|apple gpu/i.test(renderer);
  } catch {
    return false;
  }
}

const GRAIN_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const GRAIN_FRAGMENT = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    vec2 c = (vUv - 0.5) * vec2(1.0, 0.9);
    float vignette = smoothstep(0.38, 0.92, length(c)) * 0.62;
    float grain = (hash(floor(vUv * vec2(1440.0, 900.0)) + fract(uTime) * 7.0) - 0.5) * 0.14;
    gl_FragColor = vec4(vec3((1.0 - vignette) * (1.0 + grain)), 1.0);
  }
`;

/**
 * The film grain and soft vignette for GPUs that skip the composer: one multiplied full-screen
 * triangle drawn last, which costs far less than a compositor layer or a post pass.
 */
function GrainVignette() {
  const uniforms = React.useMemo(() => ({ uTime: { value: 0 } }), []);
  useFrame(() => {
    uniforms.uTime.value = live.time;
  });
  return (
    <ScreenQuad renderOrder={1000} frustumCulled={false}>
      <shaderMaterial
        vertexShader={GRAIN_VERTEX}
        fragmentShader={GRAIN_FRAGMENT}
        uniforms={uniforms}
        blending={MultiplyBlending}
        premultipliedAlpha
        depthTest={false}
        depthWrite={false}
        transparent
      />
    </ScreenQuad>
  );
}

/**
 * Compiles every material once at load. Props start hidden, and without this each one would
 * compile its shaders the first time its chapter appears, which stalls the scroll for hundreds
 * of milliseconds per program on integrated GPUs. The parallel compile path keeps it off the
 * main thread.
 */
function Precompile() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      // Label textures are applied once fonts are ready; compile after them so nothing recompiles.
      await document.fonts?.ready;
      await new Promise((r) => setTimeout(r, 120));
      if (cancelled) return;
      const hidden: Object3D[] = [];
      scene.traverse((o) => {
        if (!o.visible) {
          o.visible = true;
          hidden.push(o);
        }
      });
      const done = gl.compileAsync(scene, camera);
      hidden.forEach((o) => {
        o.visible = false;
      });
      await done;
    })();
    return () => {
      cancelled = true;
    };
  }, [gl, scene, camera]);
  return null;
}

/**
 * The one canvas behind the whole page. Mounted once, never unmounted; everything in it is
 * driven by the master scroll progress through the rig and the props.
 */
export default function StageCanvas() {
  const [tier] = React.useState(() => {
    stage.mobile = window.matchMedia("(max-width: 767px)").matches;
    stage.lite = stage.mobile || window.innerWidth < 1024;
    // ?post=1 forces the composer on, ?post=0 off; the quality loop uses these.
    const q = new URLSearchParams(window.location.search);
    stage.off = new Set((q.get("off") ?? "").split(",").filter(Boolean));
    const forced = q.get("post");
    stage.post = forced === null ? !stage.lite && strongGpu() : forced === "1";
    return { lite: stage.lite, post: stage.post, off: stage.off, dprCap: Number(q.get("dpr")) || 1.5 };
  });
  // Starts at the device ratio (capped) and steps down once if the frame rate cannot hold.
  const [dpr, setDpr] = React.useState(() => Math.min(tier.dprCap, window.devicePixelRatio || 1));

  return (
    <Canvas
      dpr={dpr}
      shadows={tier.off.has("shadow") || !tier.post ? false : "percentage"}
      gl={{ antialias: false, powerPreference: "high-performance", stencil: false }}
      camera={{ fov: 24, near: 0.1, far: 140, position: [0, 3, 22] }}
      style={{ position: "absolute", inset: 0 }}
    >
      <color attach="background" args={["#0f0e0d"]} />
      {/* Fog only fades the far void; it is a per-fragment cost the cheap tier skips. */}
      {tier.off.has("fog") || !tier.post ? null : <fog attach="fog" args={["#0f0e0d", 34, 80]} />}
      <Rig />
      <Projector />
      <Precompile />
      <Theatre />
      <Phones />
      <CommanderScreen />
      <Crew />
      <Venue />
      <ApprovalButton />
      <Beams />
      <EventSets />
      {/* Image-based lighting costs about 12 frames a second on integrated GPUs; those get a fill light instead. */}
      {tier.off.has("env") || !tier.post ? (
        <hemisphereLight color="#5a5f6c" groundColor="#1a1512" intensity={0.5} />
      ) : (
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
      )}
      <PerformanceMonitor onDecline={() => setDpr(0.85)} flipflops={2} />
      {tier.post ? null : <GrainVignette />}
      {tier.post ? (
        <EffectComposer multisampling={0} enableNormalPass={false}>
          {tier.lite ? (
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
      ) : null}
    </Canvas>
  );
}
