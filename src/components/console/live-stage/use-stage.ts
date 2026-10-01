"use client";

// Live Stage state: every node's state comes from real agent runs, run steps and proposals, first from the
// API and then from the console SSE stream. Nothing here is simulated.

import * as React from "react";
import type {
  ActionProposal,
  AgentName,
  AgentRun,
  DeliveryStatsResponse,
  MetricsSnapshot,
  StreamMessage,
} from "@/contracts";
import { AGENT_KEYS } from "@/components/ui";
import { api } from "@/lib/api-client";
import { formatTime } from "@/lib/time";

export type NodeState = "idle" | "thinking" | "proposing" | "waiting" | "done" | "failed" | "paused";
export type Pulse = { id: string; from: string; to: string; until: number };
export type LogLine = { id: string; at: string; text: string; tone?: "agent" | "human" | "system" | "warn" };

type Live = { runId: string; phase: "thinking" | "proposing" };
type Finished = { status: AgentRun["status"]; at: number };

/** Which data node an executed action touches. */
export const DATA_OF: Record<string, string> = {
  schedule: "data:schedule",
  speakers: "data:schedule",
  crew: "data:crew",
  registrations: "data:registrations",
  finance: "data:money",
  sponsorship: "data:money",
  helpdesk: "data:kb",
  comms: "data:kb",
  logistics: "data:crew",
  planning: "data:schedule",
  ops: "data:crew",
  marketing: "data:registrations",
  post_event: "data:kb",
};
const CHANNEL_NODES = [
  "channel:in_app",
  "channel:email",
  "channel:whatsapp",
  "channel:telegram",
  "channel:sms",
];
const PULSE_MS = 4000;
const DONE_MS = 45_000;
const label = (a: string) => a.replace("_", " ").replace(/^\w/, (c) => c.toUpperCase());

export function useStage(eventId: string) {
  const [live, setLive] = React.useState<Partial<Record<AgentName, Live>>>({});
  const [finished, setFinished] = React.useState<Partial<Record<AgentName, Finished>>>({});
  const [disabled, setDisabled] = React.useState<Set<AgentName>>(new Set());
  const [killed, setKilled] = React.useState(false);
  const [pending, setPending] = React.useState<ActionProposal[]>([]);
  const [delivery, setDelivery] = React.useState<DeliveryStatsResponse["channels"]>([]);
  const [pulses, setPulses] = React.useState<Pulse[]>([]);
  const [log, setLog] = React.useState<LogLine[]>([]);
  const [connected, setConnected] = React.useState(false);
  const [metrics, setMetrics] = React.useState<MetricsSnapshot | null>(null);
  // Bumped when a message may have reached someone's phone: an outbox row changed or a proposal moved.
  const [feedTick, setFeedTick] = React.useState(0);
  const [now, setNow] = React.useState(() => Date.now());
  const agentOf = React.useRef(new Map<string, AgentName>());
  // The server may run a demo clock; metrics carry its time, so the log reads the same clock as the console.
  const offset = React.useRef(0);
  // The same offset as state, so the phone mockups can show the demo clock.
  const [skew, setSkew] = React.useState(0);

  const addLog = React.useCallback((text: string, tone?: LogLine["tone"]) => {
    const at = new Date(Date.now() + offset.current).toISOString();
    setLog((l) => [...l.slice(-199), { id: `${at}-${Math.random()}`, at, text, tone }]);
  }, []);
  const pulse = React.useCallback((from: string, to: string) => {
    setPulses((p) => [
      ...p.filter((x) => x.until > Date.now()),
      { id: `${from}>${to}>${Date.now()}`, from, to, until: Date.now() + PULSE_MS },
    ]);
  }, []);

  const loadPending = React.useCallback(
    () =>
      api
        .call("listProposals", { params: { eventId }, query: { status: "pending", limit: 100 } })
        .then((r) => {
          const top = r.items.filter((p) => !p.parentId && p.status === "pending");
          for (const p of r.items)
            if (p.proposedBy.kind === "agent") agentOf.current.set(p.id, p.proposedBy.agent);
          setPending(top);
        }),
    [eventId],
  );
  const loadDelivery = React.useCallback(
    () =>
      api.call("deliveryStats", { params: { eventId } }).then(
        (r) => setDelivery(r.channels),
        () => undefined,
      ),
    [eventId],
  );

  // Initial picture: last run per agent, pending proposals, which agents are switched off, delivery counts.
  React.useEffect(() => {
    void loadPending().catch(() => undefined);
    void loadDelivery();
    api.call("overview", { params: { eventId } }).then(
      (o) => {
        offset.current = Date.parse(o.metrics.at) - Date.now();
        setSkew(offset.current);
        setMetrics(o.metrics);
        setDisabled(new Set(o.agents.filter((a) => !a.enabled).map((a) => a.name)));
        setKilled(!o.globalAgentsEnabled);
      },
      () => undefined,
    );
    api.call("listAgentRuns", { params: { eventId }, query: { limit: 50 } }).then(
      (r) => {
        const last: Partial<Record<AgentName, Finished>> = {};
        const running: Partial<Record<AgentName, Live>> = {};
        for (const run of [...r.items].reverse()) {
          if (run.status === "running") running[run.agent] = { runId: run.id, phase: "thinking" };
          else last[run.agent] = { status: run.status, at: Date.parse(run.finishedAt ?? run.startedAt) };
        }
        setFinished(last);
        setLive(running);
      },
      () => undefined,
    );
    const t = setInterval(() => void loadDelivery(), 10_000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(t);
      clearInterval(clock);
    };
  }, [eventId, loadPending, loadDelivery]);

  // The stream.
  React.useEffect(() => {
    const url = api.streamUrl("stream", { eventId });
    if (!url) return;
    const es = new EventSource(url);
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    const on = <T extends StreamMessage["type"]>(
      type: T,
      fn: (m: Extract<StreamMessage, { type: T }>) => void,
    ) => es.addEventListener(type, (e) => fn(JSON.parse((e as MessageEvent<string>).data)));

    on("agent_run", ({ run }) => {
      if (run.simulation) return;
      if (run.status === "running") {
        setLive((l) => ({ ...l, [run.agent]: { runId: run.id, phase: "thinking" } }));
        if (run.agent !== "commander") pulse("agent:commander", `agent:${run.agent}`);
        addLog(`${label(run.agent)} woke up (${run.trigger.eventType ?? run.trigger.type})`, "agent");
      } else {
        setLive((l) => {
          const n = { ...l };
          delete n[run.agent];
          return n;
        });
        setFinished((f) => ({ ...f, [run.agent]: { status: run.status, at: Date.now() } }));
        const cost = run.costUsd ? `, $${run.costUsd.toFixed(4)}` : "";
        addLog(
          `${label(run.agent)} ${run.status === "failed" ? "failed" : "finished"}: ${run.proposalIds.length} proposals${cost}`,
          run.status === "failed" ? "warn" : "agent",
        );
        void loadPending().catch(() => undefined);
      }
    });
    on("agent_step", (m) => {
      setLive((l) =>
        l[m.agent]
          ? {
              ...l,
              [m.agent]: { runId: m.runId, phase: m.kind === "propose" ? "proposing" : l[m.agent]!.phase },
            }
          : l,
      );
      if (m.kind === "propose") pulse(`agent:${m.agent}`, "gate:head");
      if (m.kind === "llm") addLog(`${label(m.agent)} is thinking`, "agent");
      if (m.kind === "guard") addLog(`${label(m.agent)} screened untrusted input`, "system");
      if (m.kind === "fallback") addLog(`${label(m.agent)} used its rules fallback`, "warn");
    });
    on("outbox", () => {
      setFeedTick((n) => n + 1);
      void loadDelivery();
    });
    on("metrics", ({ metrics: m }) => {
      offset.current = Date.parse(m.at) - Date.now();
      setSkew(offset.current);
      setMetrics(m);
    });
    const seen = new Set<string>();
    on("proposal", async ({ proposal: p }) => {
      // An auto-executed proposal arrives on both its created and executed events; say each status once.
      if (seen.has(`${p.id}:${p.status}`)) return;
      seen.add(`${p.id}:${p.status}`);
      setFeedTick((n) => n + 1);
      let agent = agentOf.current.get(p.id);
      if ((!agent || p.kind === "plan.bundle") && p.status === "pending") {
        // The stream card does not say who proposed it; one lookup per new proposal does.
        const d = await api.call("getProposal", { params: { eventId, proposalId: p.id } }).catch(() => null);
        if (d?.proposal.proposedBy.kind === "agent")
          agentOf.current.set(p.id, (agent = d.proposal.proposedBy.agent));
        // A plan: the Commander delegated each step to an agent, and each goes to the approval gate.
        const children = (d?.proposal.payload as { children?: { proposedBy?: AgentName }[] } | undefined)
          ?.children;
        for (const who of new Set((children ?? []).map((c) => c.proposedBy).filter(Boolean) as AgentName[])) {
          pulse("agent:commander", `agent:${who}`);
          pulse(`agent:${who}`, "gate:head");
          addLog(`Commander delegated a step to ${label(who)}`, "agent");
        }
      }
      if (p.status === "pending") {
        addLog(
          `${agent ? label(agent) : "Someone"} proposed: ${p.summary} (${p.riskTier}, waiting for approval)`,
          "agent",
        );
        if (p.riskTier === "T3") pulse("gate:head", "gate:faculty");
      } else if (p.status === "executed") {
        addLog(`Done: ${p.summary}`, "system");
        pulse(
          p.riskTier === "T0" || p.riskTier === "T1" ? `agent:${agent ?? "commander"}` : "gate:head",
          DATA_OF[p.domain] ?? "data:kb",
        );
        if (p.kind.startsWith("comms.") || p.kind === "plan.bundle") {
          // Only the channels this proposal actually used, from its payload (a plan: its children's).
          const d = await api
            .call("getProposal", { params: { eventId, proposalId: p.id } })
            .catch(() => null);
          type WithChannels = { channels?: string[]; children?: { payload?: { channels?: string[] } }[] };
          const pl = (d?.proposal.payload ?? {}) as WithChannels;
          const used = new Set([
            ...(pl.channels ?? []),
            ...(pl.children ?? []).flatMap((c) => c.payload?.channels ?? []),
          ]);
          for (const c of CHANNEL_NODES)
            if (used.has(c.slice("channel:".length))) pulse(DATA_OF[p.domain] ?? "data:kb", c);
        }
        void loadDelivery();
      } else if (p.status === "approved") addLog(`Approved: ${p.summary}`, "human");
      else if (p.status === "rejected") addLog(`Rejected: ${p.summary}`, "human");
      void loadPending().catch(() => undefined);
    });
    // Check-ins (a synced offline queue is a burst): one metrics refetch a second after the last one.
    let checkinTimer: ReturnType<typeof setTimeout> | undefined;
    on("domain_event", ({ event: e }) => {
      if (e.type.startsWith("proposal.")) return;
      if (e.type === "registration.checked_in") {
        clearTimeout(checkinTimer);
        checkinTimer = setTimeout(
          () =>
            void api.call("overview", { params: { eventId } }).then(
              (o) => setMetrics(o.metrics),
              () => undefined,
            ),
          1000,
        );
        return;
      }
      addLog(`Event: ${e.type.replace(/[._]/g, " ")}`, "system");
    });
    return () => es.close();
  }, [eventId, addLog, pulse, loadPending, loadDelivery]);

  // The voice Commander narrates the same work: its steps light the nodes it names and go into the log.
  React.useEffect(() => {
    const onStage = (e: Event) => {
      const d = (e as CustomEvent<{ label: string; nodes: string[]; state: string }>).detail;
      for (const n of d.nodes) if (n !== "agent:commander") pulse("agent:commander", n);
      if (d.state === "active") addLog(`Voice: ${d.label}`, "human");
    };
    window.addEventListener("offstage:voice-stage", onStage);
    return () => window.removeEventListener("offstage:voice-stage", onStage);
  }, [addLog, pulse]);

  const waitingBy = new Map<AgentName, ActionProposal[]>();
  for (const p of pending) {
    const a = p.proposedBy.kind === "agent" ? p.proposedBy.agent : null;
    if (a && (p.riskTier === "T2" || p.riskTier === "T3")) waitingBy.set(a, [...(waitingBy.get(a) ?? []), p]);
  }
  const stateOf = (a: AgentName): NodeState => {
    if (killed || disabled.has(a)) return "paused";
    const l = live[a];
    if (l) return l.phase;
    const f = finished[a];
    if (f?.status === "budget_paused") return "paused";
    if (f?.status === "failed" && now - f.at < DONE_MS * 4) return "failed";
    if (waitingBy.has(a)) return "waiting";
    if (f && now - f.at < DONE_MS) return "done";
    return "idle";
  };

  return {
    agents: AGENT_KEYS,
    stateOf,
    live,
    pending,
    waitingBy,
    delivery,
    pulses: pulses.filter((p) => p.until > now),
    log,
    connected,
    metrics,
    feedTick,
    /** Milliseconds on the demo clock, ticking once a second. */
    clock: now + skew,
    label,
    reload: loadPending,
    fmt: formatTime,
  };
}
