/**
 * Commander intake. The organizer's answers go onto their own draft event as they come in (they are facts the
 * organizer stated, not agent decisions); the plan itself is a plan.create proposal that a human approves.
 * Interview state lives in app_settings under `intake:<conversationId>`.
 */
import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { ALL_AGENTS } from "@/agents";
import { missing, planFromBrief, questionsFor, readAnswer, readBrief } from "@/agents/commander/intake";
import {
  EventSettings,
  type AgentActor,
  type EventBrief,
  type IntakeRequest,
  type IntakeResponse,
} from "@/contracts";
import { db as defaultDb, type Db } from "@/db/client";
import * as t from "@/db/schema";
import { istToUtc, nowUtc } from "@/lib/time";
import { forbidden, notFound } from "@/server/http";
import { propose } from "@/server/actions/propose";
import { syncDemoClock } from "@/server/clock";

type State = { eventId: string; userId: string; brief: Partial<EventBrief>; asked: string[] };
const key = (conversationId: string) => `intake:${conversationId}`;

/** Only people who run an event (owner or organizer somewhere) can start one. */
async function orgFor(userId: string, client: Db): Promise<string> {
  const [m] = await client
    .select({ orgId: t.memberships.orgId })
    .from(t.memberships)
    .where(and(eq(t.memberships.userId, userId), inArray(t.memberships.role, ["owner", "organizer"])))
    .limit(1);
  if (!m) throw forbidden("Only event owners and organizers can plan a new event");
  return m.orgId;
}

/** Event fields straight from what the organizer said. Dates run 09:00 to 18:00 IST. */
function eventFields(b: Partial<EventBrief>) {
  const dates = [...(b.dates ?? [])].sort();
  return {
    ...(b.name ? { name: b.name } : {}),
    ...(b.type ? { type: b.type } : {}),
    ...(dates.length
      ? { startsAt: istToUtc(`${dates[0]}T09:00`), endsAt: istToUtc(`${dates.at(-1)}T18:00`) }
      : {}),
    ...(b.venue ? { venue: { name: b.venue, address: "", city: "" } } : {}),
    ...(b.expectedAttendance !== undefined ? { capacity: b.expectedAttendance } : {}),
    brief: b as EventBrief,
  };
}

export async function intakeTurn(
  userId: string,
  req: IntakeRequest,
  client: Db = defaultDb,
): Promise<IntakeResponse> {
  await syncDemoClock(client);
  const now = nowUtc().toISOString();
  const conversationId = req.conversationId ?? randomUUID();
  const [saved] = req.conversationId
    ? await client
        .select()
        .from(t.appSettings)
        .where(eq(t.appSettings.key, key(req.conversationId)))
    : [];
  const state = saved?.value as State | undefined;
  if (req.conversationId && !state) throw notFound("Interview not found");
  if (state && state.userId !== userId) throw forbidden();
  if (state && req.eventId && state.eventId !== req.eventId) throw forbidden();

  const io = { runId: `intake:${conversationId}`, onAttempt: () => {}, critical: false };
  const read = await readBrief(req.text, now, io, state?.brief);
  const answer = state?.asked.length ? readAnswer(req.text, state.asked, now) : {};
  const brief: Partial<EventBrief> = { ...(state?.brief ?? {}), ...read, ...answer };

  let eventId = state?.eventId ?? req.eventId;
  if (!eventId) {
    const orgId = await orgFor(userId, client);
    const fields = eventFields(brief);
    const [ev] = await client
      .insert(t.events)
      .values({
        orgId,
        slug: `draft-${randomUUID().slice(0, 8)}`,
        name: brief.name ?? "New event",
        type: brief.type ?? "other",
        startsAt: fields.startsAt ?? nowUtc(),
        endsAt: fields.endsAt ?? nowUtc(),
        venue: fields.venue ?? { name: "To be decided", address: "", city: "" },
        capacity: brief.expectedAttendance ?? 0,
        status: "draft",
        settings: EventSettings.parse({}),
        brief: brief as EventBrief,
      })
      .returning({ id: t.events.id });
    eventId = ev!.id;
    await client.insert(t.memberships).values({ orgId, eventId, userId, role: "owner" });
  } else {
    const [ev] = await client
      .select({ status: t.events.status })
      .from(t.events)
      .where(eq(t.events.id, eventId));
    if (!ev) throw notFound("Event not found");
    // A live event keeps its details; intake only fills in drafts and events still being planned.
    if (ev.status === "draft" || ev.status === "planning")
      await client.update(t.events).set(eventFields(brief)).where(eq(t.events.id, eventId));
  }

  const gaps = missing(brief);
  const store = (asked: string[]) =>
    client
      .insert(t.appSettings)
      .values({ key: key(conversationId), value: { eventId, userId, brief, asked } satisfies State })
      .onConflictDoUpdate({ target: t.appSettings.key, set: { value: { eventId, userId, brief, asked } } });

  if (gaps.length) {
    const questions = questionsFor(gaps);
    await store(questions.map((q) => q.id));
    return { status: "questions", conversationId, questions, eventId, brief };
  }

  const team = ALL_AGENTS.map((a) => ({ agent: a.name, humanLeadRole: a.humanLeadRole, purpose: a.purpose }));
  const payload = planFromBrief(brief as EventBrief, now, team);
  const actor: AgentActor = { kind: "agent", agent: "commander", runId: `intake:${conversationId}`, eventId };
  const res = await propose(
    actor,
    {
      kind: "plan.create",
      payload,
      summary:
        `Plan for ${brief.name}: ${payload.milestones.length} milestones, ${payload.agentTeam.filter((a) => a.enabled).length} agents`.slice(
          0,
          120,
        ),
      rationale: `${payload.summary} Milestones are dated back from the first day, the budget follows the ${brief.type} template, and the agent team is the template's.`,
      evidence: [{ type: "row", ref: `events/${eventId}`, label: brief.name!.slice(0, 160) }],
      idempotencyKey: `intake:${conversationId}:${createHash("sha256").update(JSON.stringify(brief)).digest("hex").slice(0, 16)}`,
    },
    client,
  );
  if (res.status !== "created" && res.status !== "duplicate")
    return { status: "refused", reason: "The plan could not be proposed.", eventId, brief };
  await store([]);
  return {
    status: "planned",
    planId: res.proposal.id,
    proposalIds: [res.proposal.id],
    agentsWoken: payload.agentTeam.filter((a) => a.enabled).map((a) => a.agent),
    eventId,
    brief,
  };
}
