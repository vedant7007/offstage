"use client";

import * as React from "react";
import { useFrame } from "@react-three/fiber";
import {
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  type Group,
  type InstancedMesh,
  type Mesh,
  type MeshBasicMaterial,
  type MeshStandardMaterial,
  Object3D,
  Vector3,
} from "three";
import { CUE_BLUE, GO_GREEN, TUNGSTEN } from "../chapters";
import { BEAM_X, BUTTON_AT, RIPPLE_AT } from "../overlay-labels";
import { bump, lerp, local, stage, window01 } from "../scroll-store";

const dummy = new Object3D();

function hash(i: number, salt = 0) {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

interface Room {
  name: string;
  size: [number, number, number];
  at: [number, number, number];
}

const ROOMS: Room[] = [
  { name: "Main Auditorium", size: [2.3, 1.05, 1.5], at: [-1.7, 0.525, -1.0] },
  { name: "Lab 204", size: [1.1, 0.7, 0.9], at: [1.35, 0.35, -1.35] },
  { name: "Lab 201", size: [1.1, 0.7, 0.9], at: [2.65, 0.35, -0.2] },
  { name: "Seminar Hall", size: [1.4, 0.8, 1.0], at: [1.6, 0.4, 1.0] },
];

const DESK: [number, number, number] = [-1.3, 0.17, 1.35];

/** How dark the Main Auditorium is: from the crisis until the approval button is pressed. */
function auditoriumDark(p: number) {
  return window01(p, 4.45, 4.75) * (1 - window01(p, 6.5, 6.62));
}

/**
 * Preparation: the stage floor becomes a miniature venue, rooms with lit doorways, a desk, and
 * tiny figures flowing in along paths. Stays through the crisis, the approval and the fan-out.
 */
export function Venue() {
  const group = React.useRef<Group>(null);
  const doors = React.useRef<(MeshStandardMaterial | null)[]>([]);

  useFrame(() => {
    const p = stage.p;
    const vis = bump(p, 3.45, 3.9, 7.5, 7.95);
    if (!group.current) return;
    group.current.visible = vis > 0.002;
    group.current.position.y = lerp(-1.3, 0, vis);
    const dark = auditoriumDark(p);
    doors.current.forEach((d, i) => {
      if (d) d.emissiveIntensity = (i === 0 ? 1 - dark : 1) * 1.6;
    });
  });

  return (
    <group ref={group}>
      {ROOMS.map((r, i) => (
        <group key={r.name} position={r.at}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={r.size} />
            <meshStandardMaterial color="#e9e0d2" roughness={0.85} />
          </mesh>
          <mesh position={[0, -r.size[1] / 2 + 0.24, r.size[2] / 2 + 0.002]}>
            <planeGeometry args={[0.2, 0.46]} />
            <meshStandardMaterial
              ref={(m) => {
                doors.current[i] = m;
              }}
              color="#2a2018"
              emissive={TUNGSTEN}
              emissiveIntensity={1.6}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
      <mesh position={DESK} castShadow receiveShadow>
        <boxGeometry args={[1.2, 0.34, 0.4]} />
        <meshStandardMaterial color="#c9b79c" roughness={0.7} />
      </mesh>
      <Figures />
      <TinyPhones />
    </group>
  );
}

const PATHS = [
  new CatmullRomCurve3([
    new Vector3(0.2, 0, 2.3),
    new Vector3(-0.6, 0, 1.6),
    new Vector3(-1.4, 0, 0.6),
    new Vector3(-1.7, 0, -0.1),
  ]),
  new CatmullRomCurve3([
    new Vector3(0.4, 0, 2.3),
    new Vector3(0.2, 0, 1.4),
    new Vector3(0.9, 0, 0.4),
    new Vector3(1.35, 0, -0.75),
  ]),
  new CatmullRomCurve3([
    new Vector3(0.6, 0, 2.3),
    new Vector3(1.0, 0, 1.8),
    new Vector3(2.0, 0, 1.2),
    new Vector3(2.6, 0, 0.4),
  ]),
];

/** Attendees: instanced capsules that flow along three paths as the visitor scrolls. */
function Figures() {
  const count = stage.lite ? 64 : 128;
  const ref = React.useRef<InstancedMesh>(null);
  const seeds = React.useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        path: i % 3,
        base: hash(i, 11),
        side: (hash(i, 12) - 0.5) * 0.5,
        speed: 0.8 + hash(i, 13) * 0.5,
      })),
    [count],
  );
  const tmp = React.useMemo(() => new Vector3(), []);
  const color = React.useMemo(() => new Color(), []);

  React.useEffect(() => {
    if (!ref.current) return;
    for (let i = 0; i < count; i++) {
      color.setHSL(0.08 + hash(i, 14) * 0.06, 0.25, 0.55 + hash(i, 15) * 0.3);
      ref.current.setColorAt(i, color);
    }
    ref.current.instanceColor!.needsUpdate = true;
  }, [count, color]);

  useFrame(() => {
    const p = stage.p;
    if (!ref.current) return;
    const flow = Math.max(0, p - 3.35) * 0.22;
    for (let i = 0; i < count; i++) {
      const s = seeds[i]!;
      const t = (s.base + flow * s.speed) % 1;
      PATHS[s.path]!.getPointAt(t, tmp);
      dummy.position.set(tmp.x + s.side, 0.085, tmp.z + s.side * 0.6);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} castShadow frustumCulled={false}>
      <capsuleGeometry args={[0.032, 0.09, 2, 6]} />
      <meshStandardMaterial color="#ffffff" roughness={0.8} />
    </instancedMesh>
  );
}

/** Fan-out: phones among the attendees light up one by one as the notices land. */
function TinyPhones() {
  const count = stage.lite ? 16 : 30;
  const ref = React.useRef<InstancedMesh>(null);
  const seeds = React.useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: -2.4 + hash(i, 21) * 5.0,
        z: -0.4 + hash(i, 22) * 2.6,
        order: hash(i, 23),
      })),
    [count],
  );
  const dark = React.useMemo(() => new Color("#1a1816"), []);
  const lit = React.useMemo(() => new Color(CUE_BLUE).multiplyScalar(2.8), []);
  const color = React.useMemo(() => new Color(), []);

  React.useEffect(() => {
    if (!ref.current) return;
    seeds.forEach((s, i) => {
      dummy.position.set(s.x, 0.2, s.z);
      dummy.rotation.set(-0.5, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      ref.current!.setMatrixAt(i, dummy.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [seeds]);

  useFrame(() => {
    const p = stage.p;
    const f = local(p, 7);
    if (!ref.current) return;
    const vis = bump(p, 6.6, 6.9, 7.6, 7.9);
    ref.current.visible = vis > 0.01;
    seeds.forEach((s, i) => {
      const on = window01(f, 0.28 + s.order * 0.3, 0.32 + s.order * 0.3) * vis;
      color.copy(dark).lerp(lit, on);
      ref.current!.setColorAt(i, color);
    });
    ref.current.instanceColor!.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false} visible={false}>
      <planeGeometry args={[0.07, 0.12]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

/**
 * Approval: a large button under a hinged cover rises from the floor; the cover opens, the
 * button presses down, and ripple rings spread over the venue with what the one tap touched.
 */
export function ApprovalButton() {
  const group = React.useRef<Group>(null);
  const cover = React.useRef<Group>(null);
  const button = React.useRef<Mesh>(null);
  const buttonMat = React.useRef<MeshStandardMaterial>(null);
  const rings = React.useRef<(Mesh | null)[]>([]);
  const ringMats = React.useRef<(MeshBasicMaterial | null)[]>([]);

  useFrame(() => {
    const p = stage.p;
    const f = local(p, 6);
    const vis = bump(p, 5.5, 5.95, 6.75, 7.1);
    if (!group.current) return;
    group.current.visible = vis > 0.002;
    const rise = window01(f, 0.02, 0.22);
    group.current.position.y = lerp(-0.7, 0, Math.min(rise, vis));
    if (cover.current) cover.current.rotation.x = -window01(f, 0.22, 0.42) * 1.95;
    const press = window01(f, 0.46, 0.56);
    if (button.current) button.current.position.y = lerp(0.25, 0.14, press);
    if (buttonMat.current) buttonMat.current.emissiveIntensity = press * 1.8;
    rings.current.forEach((r, k) => {
      if (!r) return;
      const s = window01(f, 0.54 + k * 0.08, 1.0);
      r.visible = s > 0.001 && s < 0.999;
      r.scale.setScalar(0.2 + s * 3.6);
      const m = ringMats.current[k];
      if (m) m.opacity = (1 - s) * 0.85;
    });
  });

  return (
    <group ref={group} position={BUTTON_AT}>
      <mesh position-y={0.11} castShadow receiveShadow>
        <cylinderGeometry args={[0.5, 0.55, 0.22, 32]} />
        <meshStandardMaterial color="#2a2622" roughness={0.45} metalness={0.5} />
      </mesh>
      <mesh ref={button} position-y={0.25} castShadow>
        <cylinderGeometry args={[0.32, 0.32, 0.18, 32]} />
        <meshStandardMaterial
          ref={buttonMat}
          color={GO_GREEN}
          emissive={GO_GREEN}
          emissiveIntensity={0}
          roughness={0.35}
        />
      </mesh>
      <group ref={cover} position={[0, 0.22, -0.55]}>
        <mesh position={[0, 0.2, 0.55]} castShadow>
          <cylinderGeometry args={[0.56, 0.56, 1.1, 24, 1, false, -Math.PI / 2, Math.PI]} />
          <meshStandardMaterial color="#7a1d2b" roughness={0.5} metalness={0.2} side={2} />
        </mesh>
      </group>
      {RIPPLE_AT.map((_, k) => (
        <mesh
          key={k}
          ref={(m) => {
            rings.current[k] = m;
          }}
          rotation-x={-Math.PI / 2}
          position-y={0.02}
          visible={false}
        >
          <ringGeometry args={[0.975, 1, 72]} />
          <meshBasicMaterial
            ref={(m) => {
              ringMats.current[k] = m;
            }}
            color={[2.2, 1.55, 0.55]}
            transparent
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

const BEAM_H = 5.2;

/** Fan-out: five beams of light shoot up out of the box, one per channel. */
export function Beams() {
  const group = React.useRef<Group>(null);
  const beams = React.useRef<(Mesh | null)[]>([]);
  const beamGeometry = React.useMemo(() => {
    const g = new CylinderGeometry(0.05, 0.11, BEAM_H, 12, 1, true);
    g.translate(0, BEAM_H / 2, 0);
    return g;
  }, []);

  useFrame(() => {
    const p = stage.p;
    const f = local(p, 7);
    const vis = bump(p, 6.55, 6.95, 7.6, 8.0);
    if (!group.current) return;
    group.current.visible = vis > 0.002;
    beams.current.forEach((b, k) => {
      if (!b) return;
      const h = window01(f, 0.06 + k * 0.07, 0.3 + k * 0.07) * vis;
      b.scale.set(1, Math.max(0.0001, h), 1);
    });
  });

  return (
    <group ref={group} position={[0, 0.05, 0.2]}>
      {BEAM_X.map((x, k) => (
        <group key={x} position-x={x}>
          <mesh
            ref={(m) => {
              beams.current[k] = m;
            }}
            geometry={beamGeometry}
          >
            <meshBasicMaterial
              color={[0.35, 0.7, 1.4]}
              transparent
              opacity={0.55}
              depthWrite={false}
              blending={2}
              toneMapped={false}
              side={2}
            />
          </mesh>
          <mesh position-y={0.01} rotation-x={-Math.PI / 2}>
            <circleGeometry args={[0.16, 24]} />
            <meshBasicMaterial
              color={[0.6, 1.2, 2.4]}
              transparent
              opacity={0.9}
              toneMapped={false}
              depthWrite={false}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}
