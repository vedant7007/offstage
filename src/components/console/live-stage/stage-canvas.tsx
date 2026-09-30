"use client";

import * as React from "react";
import {
  Background,
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
import { AgentAvatar, Badge, type Tone } from "@/components/ui";
import type { NodeState, Pulse } from "./use-stage";

const STATE: Record<NodeState, { label: string; tone: Tone; ring: string }> = {
  idle: { label: "Idle", tone: "neutral", ring: "border-border" },
  thinking: {
    label: "Thinking",
    tone: "info",
    ring: "border-info shadow-[0_0_0_4px_var(--color-info-soft)]",
  },
  proposing: {
    label: "Proposing",
    tone: "agent",
    ring: "border-agent shadow-[0_0_0_4px_var(--color-agent-soft)]",
  },
  waiting: { label: "Waiting for approval", tone: "pending", ring: "border-pending" },
  done: { label: "Done", tone: "approved", ring: "border-approved" },
  failed: { label: "Failed", tone: "danger", ring: "border-danger" },
  paused: { label: "Paused", tone: "neutral", ring: "border-dashed border-border opacity-60" },
};

type AgentData = { agent: AgentName; state: NodeState; waiting: number; centre?: boolean };
type BoxData = { title: string; detail: string; tone?: Tone; kind: "gate" | "data" | "channel" };

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
    <div
      className={`flex w-44 flex-col items-start gap-1.5 rounded-card border-2 bg-surface p-2.5 text-fg ${s.ring} ${data.centre ? "w-52 border-curtain" : ""}`}
    >
      {handles}
      <AgentAvatar agent={data.agent} showName size={data.centre ? "md" : "sm"} />
      <div className="flex flex-wrap items-center gap-1">
        <Badge tone={s.tone} className={data.state === "thinking" ? "animate-pulse" : undefined}>
          {s.label}
        </Badge>
        {data.waiting ? <Badge tone="pending">{data.waiting} to approve</Badge> : null}
      </div>
    </div>
  );
}

function BoxNode({ data }: NodeProps<Node<BoxData>>) {
  const shape =
    data.kind === "gate" ? "rounded-full px-4" : data.kind === "channel" ? "rounded-control" : "rounded-card";
  return (
    <div
      className={`flex w-40 flex-col gap-0.5 border-2 border-border bg-surface-raised p-2 text-fg ${shape}`}
    >
      {handles}
      <span className="text-sm font-semibold">{data.title}</span>
      <span className="text-xs text-fg-muted">{data.detail}</span>
    </div>
  );
}

/** A straight edge that carries moving dots while a handoff is live. */
function PulseEdge({ sourceX, sourceY, targetX, targetY, data }: EdgeProps<Edge<{ active: boolean }>>) {
  const [path] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  const active = Boolean(data?.active);
  return (
    <>
      <BaseEdge
        path={path}
        style={{
          stroke: active ? "var(--color-agent)" : "var(--color-border)",
          strokeWidth: active ? 2.5 : 1,
          transition: "stroke 300ms",
        }}
      />
      {active
        ? [0, 0.4, 0.8].map((begin) => (
            <circle key={begin} r={4} fill="var(--color-agent)">
              <animateMotion dur="1.2s" begin={`${begin}s`} repeatCount="indefinite" path={path} />
            </circle>
          ))
        : null}
    </>
  );
}

const nodeTypes = { agent: AgentNode, box: BoxNode };
const edgeTypes = { pulse: PulseEdge };

export type StageBoxes = {
  gates: { id: string; title: string; detail: string }[];
  data: { id: string; title: string; detail: string }[];
  channels: { id: string; title: string; detail: string }[];
};

export function StageCanvas(props: {
  agents: AgentName[];
  stateOf: (a: AgentName) => NodeState;
  waitingOf: (a: AgentName) => number;
  pulses: Pulse[];
  boxes: StageBoxes;
  onOpen: (id: string) => void;
}) {
  const ring = props.agents.filter((a) => a !== "commander");
  const R = 330;
  const nodes: Node[] = [
    {
      id: "agent:commander",
      type: "agent",
      position: { x: -104, y: -40 },
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
        position: { x: Math.cos(angle) * R * 1.45 - 88, y: Math.sin(angle) * R - 30 },
        data: { agent: a, state: props.stateOf(a), waiting: props.waitingOf(a) },
        ariaLabel: `${a.replace("_", " ")}, ${STATE[props.stateOf(a)].label}`,
      };
    }),
    ...props.boxes.gates.map((g, i) => ({
      id: g.id,
      type: "box",
      position: { x: -200 + i * 240, y: R + 110 },
      data: { ...g, kind: "gate" as const },
      ariaLabel: `${g.title}: ${g.detail}`,
    })),
    ...props.boxes.data.map((d, i) => ({
      id: d.id,
      type: "box",
      position: { x: -R * 1.45 - 380, y: -220 + i * 110 },
      data: { ...d, kind: "data" as const },
      ariaLabel: `${d.title}: ${d.detail}`,
    })),
    ...props.boxes.channels.map((c, i) => ({
      id: c.id,
      type: "box",
      position: { x: R * 1.45 + 220, y: -170 + i * 110 },
      data: { ...c, kind: "channel" as const },
      ariaLabel: `${c.title}: ${c.detail}`,
    })),
  ];

  const active = new Set(props.pulses.map((p) => `${p.from}>${p.to}`));
  const base: Edge[] = ring.map((a) => ({
    id: `e:commander>${a}`,
    source: "agent:commander",
    target: `agent:${a}`,
    type: "pulse",
    data: { active: active.has(`agent:commander>agent:${a}`) },
  }));
  const extra: Edge[] = props.pulses
    .filter((p) => !(p.from === "agent:commander" && p.to.startsWith("agent:")))
    .map((p) => ({ id: p.id, source: p.from, target: p.to, type: "pulse", data: { active: true } }));

  return (
    <div className="h-[34rem] w-full overflow-hidden rounded-card border border-border bg-surface-sunken md:h-[40rem]">
      <ReactFlow
        nodes={nodes}
        edges={[...base, ...extra]}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.08 }}
        minZoom={0.2}
        nodesDraggable={false}
        nodesConnectable={false}
        onNodeClick={(_, n) => props.onOpen(n.id)}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} color="var(--color-border)" />
      </ReactFlow>
    </div>
  );
}
