"use client";

import * as React from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import {
  CatmullRomCurve3,
  type CanvasTexture,
  Color,
  type Group,
  type InstancedMesh,
  type Mesh,
  type MeshStandardMaterial,
  Object3D,
  TubeGeometry,
  Vector3,
} from "three";
import { COMMANDER_CHAT, DEPARTMENTS, TUNGSTEN } from "../chapters";
import { bump, lerp, local, stage, window01 } from "../scroll-store";
import { ChatCanvas, makeLabel } from "./labels";
import { live } from "./scene-state";

const dummy = new Object3D();

/** Deterministic pseudo-random in [0, 1) so every visitor sees the same arrangement. */
function hash(i: number, salt = 0) {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const SCREEN_AT = new Vector3(0, 1.75, 0.3);

/**
 * Chaos: a cloud of tiny phone screens with red dots pulsing out of sync. Commander: they drift
 * together and merge into one screen at centre stage.
 */
export function Phones() {
  const count = stage.lite ? 28 : 56;
  const phones = React.useRef<InstancedMesh>(null);
  const dots = React.useRef<InstancedMesh>(null);
  const seeds = React.useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: -2.3 + hash(i, 1) * 4.6,
        y: 0.45 + hash(i, 2) * 2.7,
        z: -1.5 + hash(i, 3) * 2.6,
        rot: (hash(i, 4) - 0.5) * 0.5,
        stagger: hash(i, 5),
        phase: hash(i, 6) * Math.PI * 2,
      })),
    [count],
  );

  useFrame(() => {
    const p = stage.p;
    const gather = window01(p, 1.55, 2.0);
    const t = live.time;
    if (!phones.current || !dots.current) return;
    for (let i = 0; i < count; i++) {
      const s = seeds[i]!;
      const appear = window01(p, 0.55 + s.stagger * 0.35, 0.75 + s.stagger * 0.35);
      const scale = appear * (1 - gather);
      const jx = Math.sin(t * 11 + s.phase) * 0.012 * (1 - gather);
      const jy = Math.cos(t * 9 + s.phase * 2) * 0.012 * (1 - gather);
      dummy.position.set(
        lerp(s.x, SCREEN_AT.x, gather) + jx,
        lerp(s.y, SCREEN_AT.y, gather) + jy,
        lerp(s.z, SCREEN_AT.z, gather),
      );
      dummy.rotation.set(s.rot * 0.4, s.rot, 0);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      phones.current.setMatrixAt(i, dummy.matrix);
      const pulse = (0.55 + 0.45 * Math.max(0, Math.sin(t * 4.2 + s.phase))) * scale;
      dummy.position.x += 0.07;
      dummy.position.y += 0.15;
      dummy.position.z += 0.012;
      dummy.scale.setScalar(pulse);
      dummy.updateMatrix();
      dots.current.setMatrixAt(i, dummy.matrix);
    }
    phones.current.instanceMatrix.needsUpdate = true;
    dots.current.instanceMatrix.needsUpdate = true;
    phones.current.visible = dots.current.visible = p > 0.5 && p < 2.1;
  });

  return (
    <group>
      <instancedMesh ref={phones} args={[undefined, undefined, count]} frustumCulled={false}>
        <boxGeometry args={[0.17, 0.34, 0.015]} />
        <meshStandardMaterial color="#1c1a19" emissive="#7f9fc8" emissiveIntensity={0.45} roughness={0.35} />
      </instancedMesh>
      <instancedMesh ref={dots} args={[undefined, undefined, count]} frustumCulled={false}>
        <sphereGeometry args={[0.026, 10, 8]} />
        <meshBasicMaterial color={[2.6, 0.35, 0.4]} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

/** The one screen the phones merge into, with the Commander intake chat typing on it. */
export function CommanderScreen() {
  const group = React.useRef<Group>(null);
  const chat = React.useMemo(() => new ChatCanvas(COMMANDER_CHAT), []);
  const lastShown = React.useRef(-1);

  useFrame(() => {
    const p = stage.p;
    const s = window01(p, 1.6, 2.02) * (1 - window01(p, 2.55, 2.9));
    if (group.current) {
      group.current.scale.setScalar(Math.max(0.0001, s));
      group.current.visible = s > 0.001;
    }
    const typed = window01(local(p, 2), 0.03, 0.72);
    const chars = Math.floor(typed * chat.total);
    if (chars === lastShown.current) return;
    lastShown.current = chars;
    chat.draw(chars);
  });

  return (
    <group ref={group} position={SCREEN_AT.toArray()}>
      <RoundedBox args={[2.4, 1.5, 0.06]} radius={0.04} smoothness={3} castShadow>
        <meshStandardMaterial
          color="#121110"
          roughness={0.3}
          metalness={0.2}
          emissive="#2a2420"
          emissiveIntensity={0.25}
        />
      </RoundedBox>
      <mesh position-z={0.031}>
        <planeGeometry args={[2.32, 1.42]} />
        <meshStandardMaterial
          color="#000000"
          map={chat.texture}
          emissive="#ffffff"
          emissiveMap={chat.texture}
          emissiveIntensity={0.9}
          roughness={0.6}
        />
      </mesh>
    </group>
  );
}

interface Badge {
  name: string;
  lead: string;
  rest: Vector3;
  col: number;
  row: number;
}

const COMMANDER_AT = new Vector3(0, 1.95, 1.15);

function layoutBadges(): Badge[] {
  const out: Badge[] = [];
  const cols = [-2.15, -0.72, 0.72, 2.15];
  const rows = [0.5, 1.3, 2.1, 2.9];
  DEPARTMENTS.forEach((d, col) => {
    let row = 0;
    d.agents.forEach((a) => {
      if (a.name === "Commander") return;
      out.push({ name: a.name, lead: a.lead, rest: new Vector3(cols[col]!, rows[row]!, -0.5), col, row });
      row++;
    });
  });
  return out;
}

const CRISIS_ROUTE = ["Radar", "Scheduler", "Crew Chief", "Herald", "Helpdesk"];
const PACKET_WINDOWS: [number, number][] = [
  [0.02, 0.11],
  [0.17, 0.28],
  [0.31, 0.42],
  [0.45, 0.55],
  [0.59, 0.7],
];

/**
 * Crew: fourteen badges rise out of the floor into four columns, cables draw from the Commander
 * to each. Crisis: they hover above the venue while packets travel the cables and each agent
 * lights up as it takes the handoff.
 */
export function Crew() {
  const badges = React.useMemo(() => layoutBadges(), []);
  const group = React.useRef<Group>(null);
  const meshes = React.useRef<(Mesh | null)[]>([]);
  const commander = React.useRef<Mesh>(null);
  const mats = React.useRef<(MeshStandardMaterial | null)[]>([]);
  const commanderMat = React.useRef<MeshStandardMaterial>(null);
  const packets = React.useRef<(Mesh | null)[]>([]);

  const cables = React.useMemo(
    () =>
      badges.map((b) => {
        const mid = new Vector3().lerpVectors(COMMANDER_AT, b.rest, 0.5);
        mid.y -= 0.35 + Math.abs(b.rest.x) * 0.08;
        const curve = new CatmullRomCurve3(
          [COMMANDER_AT.clone(), mid, b.rest.clone()],
          false,
          "catmullrom",
          0.6,
        );
        const geometry = new TubeGeometry(curve, 28, 0.011, 6, false);
        return { curve, geometry, total: geometry.index!.count };
      }),
    [badges],
  );

  React.useEffect(() => {
    let alive = true;
    document.fonts?.ready.then(() => {
      if (!alive) return;
      const apply = (m: MeshStandardMaterial | null, tex: CanvasTexture) => {
        if (!m) return;
        m.map = tex;
        m.color.set("#ffffff");
        m.needsUpdate = true;
      };
      apply(
        commanderMat.current,
        makeLabel({
          title: "Commander",
          sub: "Event head",
          width: 512,
          height: 296,
          bg: "#ffb23f",
          fg: "#1a1209",
          accent: "#5a3d10",
        }),
      );
      badges.forEach((b, i) =>
        apply(mats.current[i] ?? null, makeLabel({ title: b.name, sub: b.lead, width: 512, height: 296 })),
      );
    });
    return () => {
      alive = false;
    };
  }, [badges]);

  const routeIndex = React.useMemo(
    () => CRISIS_ROUTE.map((n) => badges.findIndex((b) => b.name === n)),
    [badges],
  );
  const glow = React.useMemo(() => new Color(TUNGSTEN), []);
  const tmp = React.useMemo(() => new Vector3(), []);

  useFrame(() => {
    const p = stage.p;
    const f3 = local(p, 3);
    const f5 = local(p, 5);
    const vis3 = bump(p, 2.5, 2.95, 3.5, 3.9);
    const vis5 = bump(p, 4.55, 4.9, 5.75, 6.15);
    const vis = Math.max(vis3, vis5);
    if (!group.current) return;
    group.current.visible = vis > 0.002;
    group.current.position.y = vis5 * 0.7;

    // Commander
    const cRise = vis3 * window01(f3, 0.02, 0.22);
    const cUp = Math.max(cRise, vis5);
    if (commander.current) commander.current.position.y = lerp(-0.9, COMMANDER_AT.y, cUp);
    const cGlow =
      vis5 * Math.max(window01(f5, 0.1, 0.16) * (1 - window01(f5, 0.3, 0.5)), window01(f5, 0.68, 0.74));
    if (commanderMat.current) commanderMat.current.emissiveIntensity = cGlow * 1.4;

    badges.forEach((b, i) => {
      const riseLocal = window01(f3, 0.06 + b.col * 0.06 + b.row * 0.045, 0.3 + b.col * 0.06 + b.row * 0.045);
      const up = Math.max(vis3 * riseLocal, vis5);
      const m = meshes.current[i];
      if (m) m.position.y = lerp(-0.9, b.rest.y, up);
      const draw = Math.max(vis3 * window01(f3, 0.36 + i * 0.025, 0.56 + i * 0.025), vis5);
      const cable = cables[i]!;
      cable.geometry.setDrawRange(0, Math.floor(cable.total * draw));
      const mat = mats.current[i];
      if (mat) {
        const k = routeIndex.indexOf(i);
        const end = k < 0 ? 0 : PACKET_WINDOWS[k]![1];
        const lit = k < 0 ? 0 : k === 0 ? window01(f5, 0.0, 0.05) : window01(f5, end - 0.02, end + 0.04);
        mat.emissiveIntensity = vis5 * lit * 1.3;
      }
    });

    // Packets along the cables
    packets.current.forEach((pk, k) => {
      if (!pk) return;
      const [a, b] = PACKET_WINDOWS[k]!;
      const t = window01(f5, a, b);
      const on = vis5 * bump(f5, a - 0.02, a, b, b + 0.02);
      pk.visible = on > 0.01;
      pk.scale.setScalar(0.6 + 0.4 * on);
      const cable = cables[routeIndex[k] ?? -1];
      if (!cable) return;
      // The first packet comes in from Radar; the rest go out from the Commander.
      cable.curve.getPointAt(k === 0 ? 1 - t : t, tmp);
      pk.position.copy(tmp);
    });
  });

  return (
    <group ref={group}>
      <mesh ref={commander} position={COMMANDER_AT.toArray()} castShadow>
        <boxGeometry args={[1.0, 0.58, 0.07]} />
        <meshStandardMaterial
          ref={commanderMat}
          color="#ffb23f"
          roughness={0.45}
          emissive={glow}
          emissiveIntensity={0}
        />
      </mesh>
      {badges.map((b, i) => (
        <mesh
          key={b.name}
          ref={(m) => {
            meshes.current[i] = m;
          }}
          position={b.rest.toArray()}
          castShadow
        >
          <boxGeometry args={[0.95, 0.55, 0.06]} />
          <meshStandardMaterial
            ref={(m) => {
              mats.current[i] = m;
            }}
            color="#f3ede3"
            roughness={0.5}
            emissive={glow}
            emissiveIntensity={0}
          />
        </mesh>
      ))}
      {cables.map((c, i) => (
        <mesh key={i} geometry={c.geometry}>
          <meshStandardMaterial color="#6f6a63" roughness={0.6} metalness={0.4} />
        </mesh>
      ))}
      {CRISIS_ROUTE.map((n, k) => (
        <mesh
          key={n}
          ref={(m) => {
            packets.current[k] = m;
          }}
          visible={false}
        >
          <sphereGeometry args={[0.045, 10, 8]} />
          <meshBasicMaterial color={[3.2, 2.2, 0.8]} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}
