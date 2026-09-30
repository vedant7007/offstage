"use client";

/* eslint-disable react-hooks/immutability -- three.js objects are mutated in
   useFrame callbacks, which run outside render; the compiler rules cannot tell that apart. */

import * as React from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { easing } from "maath";
import {
  Color,
  type HemisphereLight,
  Object3D,
  type PerspectiveCamera,
  type PointLight,
  type SpotLight,
  Vector3,
} from "three";
import { CUE_BLUE } from "../chapters";
import { stage } from "../scroll-store";
import { blend, chaosAmount, live, newBlended } from "./scene-state";

const DEG = Math.PI / 180;
const SMOOTH = 0.45;
const SHIFT_X = 3.2;
const SHIFT_Y = 4.6;
/** Phones: a wider lens and a longer shot so the whole box fits above the text. */
const MOBILE_R = 1.7;
const MOBILE_FOV = 8;

/**
 * The camera and the lights. Every frame: blend the chapter states for the current scroll
 * position, then damp the camera, the look-at, the field of view and each light towards it.
 * Camera positions are blended in spherical coordinates around the target, so every move is
 * an arc, and the box is pushed to one side of the screen in camera space so the text has room.
 */
export function Rig() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const key = React.useRef<SpotLight>(null);
  const top = React.useRef<SpotLight>(null);
  const rim = React.useRef<PointLight>(null);
  const hemi = React.useRef<HemisphereLight>(null);

  const [blended, want, lookAt, aim, forward, right, up, keyColor, dutchAxis] = React.useMemo(
    () => [
      newBlended(),
      new Vector3(),
      new Vector3(0, 1, 0),
      new Vector3(0, 1, 0),
      new Vector3(),
      new Vector3(),
      new Vector3(0, 1, 0),
      new Color(),
      new Vector3(),
    ],
    [],
  );
  const [topTarget, keyTarget] = React.useMemo(() => [new Object3D(), new Object3D()], []);
  React.useEffect(() => {
    if (top.current) top.current.target = topTarget;
    if (key.current) key.current.target = keyTarget;
  }, [topTarget, keyTarget]);
  const state = React.useRef({ curtain: 0, fov: 30, dutch: 0, keyI: 0, spot: 0, rim: 0, amb: 0, flicker: 1 });

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const p = stage.p;
    const s = blend(p, blended);
    live.time += dt;

    const th = s.theta * DEG;
    const ph = s.phi * DEG;
    const r = stage.mobile ? s.r * MOBILE_R : s.r;
    const fov = stage.mobile ? s.fov + MOBILE_FOV : s.fov;
    aim.set(s.tx, s.ty, s.tz);
    want.set(
      aim.x + r * Math.cos(ph) * Math.sin(th),
      aim.y + r * Math.sin(ph),
      aim.z + r * Math.cos(ph) * Math.cos(th),
    );
    // Push the box off centre in screen space: sideways on wide screens, up on phones.
    forward.subVectors(aim, want).normalize();
    right.crossVectors(forward, up).normalize();
    if (stage.mobile) {
      want.y -= SHIFT_Y;
      aim.y -= SHIFT_Y;
    } else {
      want.addScaledVector(right, s.side * SHIFT_X);
      aim.addScaledVector(right, s.side * SHIFT_X);
    }

    easing.damp3(camera.position, want, SMOOTH, dt);
    easing.damp3(lookAt, aim, SMOOTH, dt);
    camera.lookAt(lookAt);
    const st = state.current;
    easing.damp(st, "dutch", s.dutch, SMOOTH, dt);
    if (st.dutch !== 0) {
      dutchAxis.subVectors(lookAt, camera.position).normalize();
      camera.rotateOnWorldAxis(dutchAxis, st.dutch * DEG);
    }
    easing.damp(st, "fov", fov, SMOOTH, dt);
    if (Math.abs(camera.fov - st.fov) > 0.01) {
      camera.fov = st.fov;
      camera.updateProjectionMatrix();
    }

    easing.damp(st, "curtain", s.curtain, 0.6, dt);
    live.curtain = st.curtain;

    // Lights. The chaos key flickers a little; nothing else is time based.
    const chaos = chaosAmount(p);
    const flickerWant =
      chaos > 0
        ? 1 -
          chaos * (0.18 * Math.abs(Math.sin(live.time * 17.3)) + 0.12 * Math.abs(Math.sin(live.time * 5.1)))
        : 1;
    easing.damp(st, "flicker", flickerWant, 0.05, dt);
    easing.damp(st, "keyI", s.keyIntensity, SMOOTH, dt);
    easing.damp(st, "spot", s.spot, SMOOTH, dt);
    easing.damp(st, "rim", s.rim, SMOOTH, dt);
    easing.damp(st, "amb", s.ambient, SMOOTH, dt);
    easing.dampC(keyColor, s.key, SMOOTH, dt);

    if (key.current) {
      key.current.color.copy(keyColor);
      key.current.intensity = 110 * st.keyI * st.flicker;
    }
    if (top.current) top.current.intensity = 140 * st.spot;
    if (rim.current) rim.current.intensity = 40 * st.rim;
    if (hemi.current) hemi.current.intensity = 0.9 * st.amb;
  });

  return (
    <>
      <spotLight
        ref={top}
        position={[0.4, 7.6, 1.6]}
        angle={0.55}
        penumbra={0.7}
        decay={2}
        distance={20}
        color="#ffe2bd"
        castShadow
        shadow-mapSize={stage.lite ? 512 : 1024}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <primitive object={topTarget} position={[0, 0, 0.2]} />
      <spotLight ref={key} position={[-5.5, 4.6, 6.8]} angle={0.62} penumbra={0.9} decay={2} distance={24} />
      <primitive object={keyTarget} position={[0, 1.2, 0]} />
      <pointLight ref={rim} position={[0.6, 3.6, -2.9]} color={CUE_BLUE} decay={2} distance={14} />
      <hemisphereLight ref={hemi} color="#3d4350" groundColor="#0f0e0d" />
    </>
  );
}
