/**
 * Risk policy: code, not prompt (blueprint Section 4). Pure, so every rule is unit tested.
 *
 *   T0  internal record only, nobody notified             auto
 *   T1  one person, reversible, not public                auto with a 10 minute undo
 *   T2  many people, or public, or any money record       1 approval (the domain's lead or an organizer)
 *   T3  irreversible, official, bulk, sensitive, big money 2 approvals; owner or faculty when configured
 */
import type { ActionKind, EventSettings, Impact, RiskTier } from "@/contracts";

export interface TierInput {
  kind: ActionKind;
  payload: unknown;
  impact: Impact;
  /** Tiers of plan.bundle children, when tiering a bundle. */
  childTiers?: RiskTier[];
}

export interface TierResult {
  riskTier: RiskTier;
  requiredApprovals: number;
  facultyApprovalRequired: boolean;
  reasons: string[];
}

const ORDER: RiskTier[] = ["T0", "T1", "T2", "T3"];
const APPROVALS: Record<RiskTier, number> = { T0: 0, T1: 0, T2: 1, T3: 2 };

/** Starting tier for each kind before any escalation. */
export const BASE_TIER: Record<ActionKind, RiskTier> = {
  "plan.create": "T2",
  "plan.bundle": "T0",
  "plan.milestone.create": "T0",
  "plan.milestone.update": "T0",
  "plan.agent_team.set": "T2",
  "finance.budget.set": "T2",
  "finance.expense.record": "T2",
  "finance.income.record": "T2",
  "finance.quote.compare": "T1",
  "sponsor.prospect.add": "T0",
  "sponsor.outreach.draft": "T1",
  "sponsor.followup.schedule": "T0",
  "sponsor.deliverable.update": "T0",
  "marketing.post.draft": "T0",
  "marketing.calendar.set": "T1",
  "marketing.push.suggest": "T0",
  "registration.promote_waitlist": "T2",
  "registration.set_status": "T2",
  "registration.flag_duplicate": "T0",
  "registration.merge": "T2",
  "registration.capacity.set": "T2",
  "schedule.create_session": "T2",
  "schedule.move_session": "T2",
  "schedule.cancel_session": "T2",
  "schedule.change_room": "T2",
  "schedule.shift_downstream": "T2",
  "speaker.confirm": "T1",
  "speaker.requirement.record": "T0",
  "speaker.reminder.schedule": "T1",
  "crew.create_shift": "T1",
  "crew.assign_shift": "T1",
  "crew.unassign_shift": "T1",
  "crew.create_task": "T1",
  "crew.briefing.draft": "T0",
  "logistics.checklist.update": "T0",
  "logistics.inventory.update": "T0",
  "logistics.food_count.set": "T1",
  "comms.send_announcement": "T2",
  "comms.send_direct": "T2",
  "comms.reminder.schedule": "T2",
  "helpdesk.escalate": "T0",
  "helpdesk.reply": "T1",
  "kb.publish_update": "T2",
  "incident.create": "T0",
  "incident.update": "T0",
  "certificates.issue_batch": "T3",
  "od.generate_list": "T3",
  "report.generate": "T1",
  "playbook.add_lesson": "T1",
};

const MONEY_KINDS = new Set<ActionKind>([
  "finance.expense.record",
  "finance.income.record",
  "finance.budget.set",
]);
const MESSAGE_KINDS = new Set<ActionKind>([
  "comms.send_announcement",
  "comms.send_direct",
  "comms.reminder.schedule",
]);
const IRREVERSIBLE_KINDS = new Set<ActionKind>(["certificates.issue_batch", "od.generate_list"]);

/** Cancelling a session with at least this many attendees is T3 (blueprint Section 4). */
export const CANCEL_T3_ATTENDEES = 50;

function max(a: RiskTier, b: RiskTier): RiskTier {
  return ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b;
}

function field<T>(payload: unknown, key: string): T | undefined {
  return payload && typeof payload === "object"
    ? ((payload as Record<string, unknown>)[key] as T)
    : undefined;
}

export function assignTier(
  input: TierInput,
  settings: Pick<EventSettings, "t3MoneyThresholdInr" | "broadcastT3Recipients" | "facultyApproverRequired">,
): TierResult {
  const reasons: string[] = [];
  let tier = BASE_TIER[input.kind];
  // Every rule that matches is recorded; the approval card shows them all.
  const raise = (to: RiskTier, why: string) => {
    if (ORDER.indexOf(to) > ORDER.indexOf(tier)) tier = to;
    reasons.push(why);
  };
  reasons.push(`Base tier for ${input.kind} is ${tier}`);

  // Bundles take the highest tier of their children.
  if (input.kind === "plan.bundle") {
    const top = (input.childTiers ?? []).reduce<RiskTier>((a, b) => max(a, b), "T0");
    raise(top, `Bundle takes the highest tier of its ${input.childTiers?.length ?? 0} children (${top})`);
  }

  // Money: any money record is at least T2; above the event threshold it is T3.
  const money =
    input.impact.moneyInr ??
    field<number>(input.payload, "amountInr") ??
    field<number>(input.payload, "totalInr");
  if (MONEY_KINDS.has(input.kind)) {
    raise("T2", "Money record");
    if (money !== undefined && money > settings.t3MoneyThresholdInr) {
      raise("T3", `Amount above the ${settings.t3MoneyThresholdInr} INR threshold for this event`);
    }
  }

  // Messages: official or emergency notices, and large broadcasts.
  if (MESSAGE_KINDS.has(input.kind)) {
    const category = field<string>(input.payload, "category");
    if (category === "official") raise("T3", "Official notice");
    if (category === "emergency") raise("T3", "Emergency message: humans decide, agents only draft");
    if (field<{ type?: string }>(input.payload, "segment")?.type === "all") raise("T2", "Sent to everyone");
    if (input.impact.people > settings.broadcastT3Recipients) {
      raise("T3", `Reaches ${input.impact.people} people (over ${settings.broadcastT3Recipients})`);
    }
  }

  // Cancelling a well attended session.
  if (input.kind === "schedule.cancel_session" && input.impact.attendees >= CANCEL_T3_ATTENDEES) {
    raise("T3", `Cancels a session with ${input.impact.attendees} attendees`);
  }

  // Bulk moves of people.
  if (
    input.kind === "registration.promote_waitlist" &&
    input.impact.attendees > settings.broadcastT3Recipients
  ) {
    raise("T3", `Promotes ${input.impact.attendees} people at once`);
  }

  if (IRREVERSIBLE_KINDS.has(input.kind)) raise("T3", "Irreversible and official output");

  // Anything that affects more than one person, or cannot be undone, needs a human.
  if (input.impact.people > 1 && ORDER.indexOf(tier) < ORDER.indexOf("T2")) {
    raise("T2", `Affects ${input.impact.people} people`);
  }
  if (!input.impact.reversible && input.impact.people > 0 && ORDER.indexOf(tier) < ORDER.indexOf("T2")) {
    raise("T2", "Cannot be undone");
  }

  const facultyApprovalRequired = tier === "T3" && settings.facultyApproverRequired;
  if (facultyApprovalRequired) reasons.push("This event requires an owner or faculty approver on T3 actions");
  return {
    riskTier: tier,
    requiredApprovals: APPROVALS[tier],
    facultyApprovalRequired,
    reasons: dedupe(reasons),
  };
}

function dedupe(xs: string[]): string[] {
  return [...new Set(xs)];
}

export function tierRank(t: RiskTier): number {
  return ORDER.indexOf(t);
}
