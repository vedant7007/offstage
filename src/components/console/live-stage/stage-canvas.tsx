"use client";

import * as React from "react";
import {
  BaseEdge,
  type Edge,
  type EdgeProps,
  getStraightPath,
  Handle,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { AgentName } from "@/contracts";
import { AgentAvatar, Badge } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "../fx";
import { NODE_STATE as STATE, STAGE } from "./theme";
import type { NodeState, Pulse } from "./use-stage";

type AgentData = { agent: AgentName; state: NodeState; waiting: number; centre?: boolean };
type BoxData = { title: string; detail: string; kind: "gate" | "data" | "channel"; waiting?: boolean };
type EdgeData = { active: boolean; pulseId?: string; still: boolean };

const hidden = "!h-1 !w-1 !min-h-0 !min-w-0 !border-0 !bg-transparent";
const handles = (
  <>
    <Handle type="target" position={Position.Top} className={hidden} isConnectable={false} />
    <Handle type="source" position={Position.Bottom} className={hidden} isConnectable={false} />
  </>
);

function AgentNode({ data }: NodeProps<Node<AgentData>>) {
  const s = STATE[data.state];
  return (
    <div className={cn(STAGE.agent, s.ring, data.centre && STAGE.centre)}>
      {handles}
      {s.glow ? <span aria-hidden className={cn(STAGE.glow, s.glow, "motion-safe:animate-pulse")} /> : null}
      <AgentAvatar agent={data.agent} showName size={data.centre ? "md" : "sm"} />
      {/* One chip: what it is doing, or how many of its proposals wait for a person. */}
      <Badge tone={data.waiting ? "pending" : s.tone} className={STAGE.chip}>
        {data.waiting ? `${data.waiting} to approve` : s.label}
      </Badge>
    </div>
  );
}

const KIND = { gate: "Human gate", data: "Data", channel: "Channel" } as const;

function BoxNode({ data }: NodeProps<Node<BoxData>>) {
  return (
    <div className={cn(STAGE.box, STAGE.boxShape[data.kind], data.waiting && STAGE.gateWaiting)}>
      {handles}
      <span aria-hidden className={STAGE.boxKicker}>
        {KIND[data.kind]}
      </span>
      <span className={STAGE.boxTitle}>{data.title}</span>
      <span className={STAGE.boxDetail}>{data.detail}</span>
    </div>
  );
}

/** One dot, once, along the edge. SMIL starts on mount (begin="indefinite" + beginElement), not at page load. */
function Dot({ path }: { path: string }) {
  const ref = React.useRef<SVGAnimateMotionElement>(null);
  const [done, setDone] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const end = () => setDone(true);
    el.addEventListener("endEvent", end);
    el.beginElement();
    return () => el.removeEventListener("endEvent", end);
  }, []);
  if (done) return null;
  return (
    <circle r={4} fill={STAGE.dot} style={{ filter: `drop-shadow(0 0 6px ${STAGE.dot})` }}>
      <animateMotion ref={ref} dur="1.2s" begin="indefinite" fill="freeze" path={path} />
    </circle>
  );
}

/** A straight edge that lights up during a handoff and sends one dot (none with reduced motion). */
function PulseEdge({ sourceX, sourceY, targetX, targetY, data }: EdgeProps<Edge<EdgeData>>) {
  const [path] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  const active = Boolean(data?.active);
  return (
    <>
      <BaseEdge
        path={path}
        style={{
          stroke: active ? STAGE.edgeActive : STAGE.edge,
          strokeWidth: active ? 1.5 : 1,
          transition: data?.still ? undefined : "stroke 300ms",
        }}
      />
      {active && data?.pulseId && !data.still ? <Dot key={data.pulseId} path={path} /> : null}
    </>
  );
}

const nodeTypes = { agent: AgentNode, box: BoxNode };
const edgeTypes = { pulse: PulseEdge };

export type StageBoxes = {
  gates: { id: string; title: string; detail: string; waiting?: boolean }[];
  data: { id: string; title: string; detail: string }[];
  channels: { id: string; title: string; detail: string }[];
};

type Item = { id: string; data?: Record<string, unknown>; ariaLabel?: string };
const sameData = (a: Record<string, unknown>, b: Record<string, unknown>) => {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
};
/**
 * Keeps the previous object for anything whose data did not change. React Flow reuses a node whose object
 * is the same, so only the node that changed re-renders. The cache writes are idempotent.
 */
function useStable<T extends Item>(items: T[]): T[] {
  const [cache] = React.useState(() => new Map<string, T>());
  return items.map((n) => {
    const old = cache.get(n.id);
    if (old && old.ariaLabel === n.ariaLabel && sameData(old.data ?? {}, n.data ?? {})) return old;
    cache.set(n.id, n);
    return n;
  });
}

// An ellipse wide enough that neighbours never touch, with data on the left and channels on the right,
// compact enough that fitView keeps the text readable at 1440 px.
const RX = 400;
const RY = 300;
const at = (x: number, y: number) => ({ x: Math.round(x), y: Math.round(y) });

export function StageCanvas(props: {
  agents: AgentName[];
  stateOf: (a: AgentName) => NodeState;
  waitingOf: (a: AgentName) => number;
  pulses: Pulse[];
  boxes: StageBoxes;
  onOpen: (id: string) => void;
}) {
  const still = useReducedMotion();
  const ring = props.agents.filter((a) => a !== "commander");
  // Fixed positions, rounded so the server and the browser agree.
  const nodes = useStable<Node>([
    {
      id: "agent:commander",
      type: "agent",
      position: at(-96, -40),
      data: {
        agent: "commander",
        state: props.stateOf("commander"),
        waiting: props.waitingOf("commander"),
        centre: true,
      },
      ariaLabel: `Commander, ${STATE[props.stateOf("commander")].label}`,
    },
    ...ring.map((a, i) => {
      const angle = (i / ring.length) * Math.PI * 2 - Math.PI / 2;
      return {
        id: `agent:${a}`,
        type: "agent",
        position: at(Math.cos(angle) * RX - 80, Math.sin(angle) * RY - 40),
        data: { agent: a, state: props.stateOf(a), waiting: props.waitingOf(a) },
        ariaLabel: `${a.replace("_", " ")}, ${STATE[props.stateOf(a)].label}`,
      };
    }),
    ...props.boxes.gates.map((g, i) => ({
      id: g.id,
      type: "box",
      position: at(-184 + i * 224, RY + 80),
      data: { title: g.title, detail: g.detail, kind: "gate" as const, waiting: g.waiting },
      ariaLabel: `${g.title}: ${g.detail}`,
    })),
    ...props.boxes.data.map((d, i) => ({
      id: d.id,
      type: "box",
      position: at(-RX - 80 - 48 - 144, -300 + i * 124),
      data: { title: d.title, detail: d.detail, kind: "data" as const },
      ariaLabel: `${d.title}: ${d.detail}`,
    })),
    ...props.boxes.channels.map((c, i) => ({
      id: c.id,
      type: "box",
      position: at(RX + 80 + 48, -300 + i * 124),
      data: { title: c.title, detail: c.detail, kind: "channel" as const },
      ariaLabel: `${c.title}: ${c.detail}`,
    })),
  ]);

  // The newest pulse per edge; a new pulse id remounts that edge's dot, so each handoff sends one.
  const latest = new Map(props.pulses.map((p) => [`${p.from}>${p.to}`, p.id]));
  const edges = useStable<Edge>([
    ...ring.map((a) => {
      const pulseId = latest.get(`agent:commander>agent:${a}`);
      return {
        id: `e:commander>${a}`,
        source: "agent:commander",
        target: `agent:${a}`,
        type: "pulse",
        data: { active: Boolean(pulseId), pulseId, still },
      };
    }),
    ...[...latest]
      .filter(([k]) => !/^agent:commander>agent:/.test(k))
      .map(([k, pulseId]) => {
        const [source, target] = k.split(">") as [string, string];
        return { id: `x:${k}`, source, target, type: "pulse", data: { active: true, pulseId, still } };
      }),
  ]);

  const { onOpen } = props;
  const onNodeClick = React.useCallback((_: unknown, n: Node) => onOpen(n.id), [onOpen]);

  return (
    <div className={STAGE.canvas}>
      <div aria-hidden className={STAGE.spot} />
      <div aria-hidden className={STAGE.floor} />
      <span aria-hidden className={STAGE.kicker}>
        On stage now
      </span>
      <p aria-hidden className={STAGE.legend}>
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full" style={{ background: STAGE.dot }} />
          Handoff in flight
        </span>
        <span>Click a node for its glass box</span>
      </p>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        colorMode="dark"
        style={{ background: "transparent" }}
        fitView
        fitViewOptions={{ padding: 0.05 }}
        minZoom={0.2}
        nodesDraggable={false}
        nodesConnectable={false}
        onNodeClick={onNodeClick}
        proOptions={{ hideAttribution: true }}
      />
    </div>
  );
}
