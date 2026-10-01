/**
 * Timeline engine. Plays a recorded phase: each StreamMessage goes to the bus at its recorded offset
 * (long waits shortened, order kept), and the phase's response snapshot is applied when its first
 * proposal message lands (or at the end), so every refetch the console makes after that message sees
 * the new state. Approvals collect personas until the proposal's required roles are all there, then the
 * recorded `after: { approve }` phase plays.
 */
import type { ActionProposal } from "@/contracts";
import type { DemoPersona, StreamMessage } from "@/contracts/api";
import { emit } from "./bus";
import { activeScenarios, loadScenario, phaseKey, type Phase, WORLD } from "./data";
import { clockOffset, fresh, getLedger, setLedger, type Ledger } from "./store";

/** Gaps longer than this are shortened to GAP_TO, so a visitor never waits on a model. */
export const GAP_MAX = 4000;
export const GAP_TO = 1500;

/** Real offsets (ms from phase start) for each message, gaps over GAP_MAX squeezed to GAP_TO. */
export function schedule(stream: { t: number }[]): number[] {
  let at = 0;
  let prev = 0;
  return stream.map(({ t }) => {
    const gap = Math.max(0, t - prev);
    at += gap > GAP_MAX ? GAP_TO : gap;
    prev = t;
    return at;
  });
}

const demoNow = (l: Ledger) => new Date(Date.now() + clockOffset(l, WORLD.demoClock)).toISOString();

/** Recorded metrics carry the recording's clock; the console reads the demo clock from them. */
function retime(m: StreamMessage, l: Ledger): StreamMessage {
  return m.type === "metrics" ? { ...m, metrics: { ...m.metrics, at: demoNow(l) } } : m;
}

const timers = new Set<ReturnType<typeof setTimeout>>();

/** Play one phase. Resolves when its last message has gone out. */
export function playPhase(scenario: string, phase: Phase): Promise<void> {
  const key = phaseKey(scenario, phase.id);
  setLedger((l) => ({ ...l, playing: [...l.playing.filter((k) => k !== key), key] }));
  const apply = () => setLedger((l) => (l.phases.includes(key) ? l : { ...l, phases: [...l.phases, key] }));
  const at = schedule(phase.stream);
  const applyAt = phase.stream.findIndex((s) => s.msg.type === "proposal");
  return new Promise((resolve) => {
    const finish = () => {
      apply();
      setLedger((l) => ({ ...l, playing: l.playing.filter((k) => k !== key) }));
      resolve();
    };
    if (!phase.stream.length) return finish();
    phase.stream.forEach(({ msg }, i) => {
      const id = setTimeout(() => {
        timers.delete(id);
        if (i === applyAt) apply();
        emit(retime(msg, getLedger()));
        if (i === phase.stream.length - 1) finish();
      }, at[i]);
      timers.add(id);
    });
  });
}

export async function trigger(scenario: string): Promise<{ message: string }> {
  const s = await loadScenario(scenario);
  const phase = s.phases.find((p) => p.id === "trigger")!;
  void playPhase(scenario, phase);
  const r = phase.responses.demoTrigger as { message: string } | undefined;
  return { message: r?.message ?? `Started ${scenario.replace(/_/g, " ")}.` };
}

/** Who must approve, and the phase that plays once they all have. */
export async function ruleFor(l: Ledger, proposalId: string) {
  for (const s of await activeScenarios(l)) {
    const rule = s.approvals[proposalId];
    const after = s.phases.find((p) => p.after?.approve === proposalId);
    if (rule || after) return { roles: rule?.roles ?? null, scenario: s.scenario, after: after ?? null };
  }
  return { roles: null, scenario: null, after: null };
}

/** Console personas that may approve anything at all. */
export const APPROVERS: DemoPersona[] = ["owner", "faculty", "program_lead", "comms_lead"];

export function satisfied(roles: DemoPersona[] | null, required: number, got: DemoPersona[]) {
  return roles ? roles.every((r) => got.includes(r)) : got.length >= Math.max(1, required);
}

/**
 * Record an approval. Returns the personas who have approved and whether that completes the proposal;
 * when it does and a recorded phase follows, the phase starts playing.
 */
export async function approve(p: ActionProposal, persona: DemoPersona) {
  const l = getLedger();
  const rule = await ruleFor(l, p.id);
  const got = [...(l.approvals[p.id] ?? []), persona];
  setLedger((x) => ({ ...x, approvals: { ...x.approvals, [p.id]: got } }));
  const done = satisfied(rule.roles, p.requiredApprovals, got);
  if (done && rule.after && rule.scenario) void playPhase(rule.scenario, rule.after);
  else if (done)
    emit({
      type: "proposal",
      proposal: {
        id: p.id,
        kind: p.kind,
        status: "executed",
        riskTier: p.riskTier,
        summary: p.summary,
        domain: p.domain,
      },
    });
  return { got, done, rule };
}

export function reject(p: ActionProposal) {
  setLedger((l) => ({ ...l, rejected: [...l.rejected.filter((id) => id !== p.id), p.id] }));
  emit({
    type: "proposal",
    proposal: {
      id: p.id,
      kind: p.kind,
      status: "rejected",
      riskTier: p.riskTier,
      summary: p.summary,
      domain: p.domain,
    },
  });
}

/** Back to the recorded starting world. The visitor stays signed in as the same persona. */
export function resetDemo() {
  timers.forEach(clearTimeout);
  timers.clear();
  setLedger((l) => ({ ...fresh(), persona: l.persona }));
}
