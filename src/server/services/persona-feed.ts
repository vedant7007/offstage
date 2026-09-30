/**
 * "See what they see": the messages three people get, for the console's phone dock. The demo attendee
 * (Sneha), volunteer (Ravi Kumar) and speaker (Lakshmi Prasad) personas. Demo mode only; phone numbers
 * are masked to the last 4 digits, in the header and in any message text.
 */
import { and, desc, eq } from "drizzle-orm";
import type { PersonaFeedResponse, UserActor } from "@/contracts";
import { db as defaultDb, type Db } from "@/db/client";
import * as t from "@/db/schema";
import { requirePermission } from "@/server/authz";
import { demoModeOn } from "@/server/auth/demo-persona";
import { decrypt } from "@/server/pii";
import { maskPhone, maskPhones } from "@/lib/format";

type Item = PersonaFeedResponse["personas"][number]["items"][number];
const LIMIT = 30;
const DEMO_SPEAKER = "Lakshmi Prasad";

/** Outbox and in-app states, as the phone shows them. */
const DELIVERY: Record<string, string> = {
  pending: "queued",
  sending: "queued",
  sent: "delivered",
  delivered_mock: "delivered_mock",
  failed: "failed",
};
const phoneOf = (enc: string | null) => {
  if (!enc) return undefined;
  try {
    return maskPhone(decrypt(enc)) || undefined;
  } catch {
    return undefined;
  }
};

const userByEmail = (client: Db, email: string) =>
  client
    .select({ id: t.users.id })
    .from(t.users)
    .where(eq(t.users.email, email))
    .then((r) => r[0]?.id);

async function inbox(client: Db, eventId: string, who: { userId?: string; type: string; id: string }) {
  const [notes, sent] = await Promise.all([
    who.userId
      ? client
          .select()
          .from(t.notifications)
          .where(and(eq(t.notifications.eventId, eventId), eq(t.notifications.userId, who.userId)))
          .orderBy(desc(t.notifications.createdAt))
          .limit(LIMIT)
      : [],
    client
      .select()
      .from(t.outbox)
      .where(
        and(
          eq(t.outbox.eventId, eventId),
          eq(t.outbox.recipientType, who.type),
          eq(t.outbox.recipientId, who.id),
        ),
      )
      .orderBy(desc(t.outbox.createdAt))
      .limit(LIMIT),
  ]);
  const items: Item[] = [
    ...notes.map((n) => ({
      id: n.id,
      at: n.createdAt.toISOString(),
      channel: "in_app" as const,
      title: maskPhones(n.title),
      body: maskPhones(n.body),
      status: n.readAt ? "read" : "delivered",
    })),
    // Rows the caps or dedupe skipped never reached the person, so the phone does not show them.
    ...sent
      .filter((o) => o.status !== "skipped")
      .map((o) => ({
        id: o.id,
        // sentAt and scheduledFor are on the demo clock; createdAt is the database's real time.
        at: (o.sentAt ?? o.scheduledFor ?? o.createdAt).toISOString(),
        channel: o.channel as Item["channel"],
        title: o.subject ? maskPhones(o.subject) : undefined,
        body: maskPhones(o.body),
        status: DELIVERY[o.status] ?? o.status,
      })),
  ];
  return items;
}

const newestLast = (items: Item[]) => items.sort((a, b) => a.at.localeCompare(b.at)).slice(-LIMIT);

export async function personaFeed(actor: UserActor, client: Db = defaultDb): Promise<PersonaFeedResponse> {
  requirePermission(actor, "proposal.read", { eventId: actor.eventId });
  if (!demoModeOn()) return { personas: [] };
  const eventId = actor.eventId;
  const personas: PersonaFeedResponse["personas"] = [];

  const snehaUser = await userByEmail(client, "sneha@sutradhar.test");
  const [reg] = snehaUser
    ? await client
        .select({ id: t.registrations.id, name: t.registrations.name, phoneEnc: t.registrations.phoneEnc })
        .from(t.registrations)
        .where(and(eq(t.registrations.eventId, eventId), eq(t.registrations.userId, snehaUser)))
    : [];
  if (reg)
    personas.push({
      key: "attendee",
      name: reg.name,
      role: "Attendee",
      phone: phoneOf(reg.phoneEnc),
      items: newestLast(
        await inbox(client, eventId, { userId: snehaUser, type: "registration", id: reg.id }),
      ),
    });

  const raviUser = await userByEmail(client, "ravi@sutradhar.test");
  const [vol] = raviUser
    ? await client
        .select({ id: t.volunteers.id, name: t.volunteers.name, phoneEnc: t.volunteers.phoneEnc })
        .from(t.volunteers)
        .where(and(eq(t.volunteers.eventId, eventId), eq(t.volunteers.userId, raviUser)))
    : [];
  if (vol) {
    const tasks = await client
      .select()
      .from(t.tasks)
      .where(and(eq(t.tasks.eventId, eventId), eq(t.tasks.assigneeVolunteerId, vol.id)))
      .orderBy(desc(t.tasks.createdAt))
      .limit(10);
    personas.push({
      key: "volunteer",
      name: vol.name,
      role: "Volunteer",
      phone: phoneOf(vol.phoneEnc),
      items: newestLast([
        ...(await inbox(client, eventId, { userId: raviUser, type: "volunteer", id: vol.id })),
        ...tasks.map((k) => ({
          id: k.id,
          at: k.createdAt.toISOString(),
          channel: "task" as const,
          title: k.title,
          body: k.description ?? "",
          status: k.status,
        })),
      ]),
    });
  }

  // The demo speaker, or the first confirmed one on another event.
  const speakers = await client
    .select({ id: t.speakers.id, name: t.speakers.name, phoneEnc: t.speakers.phoneEnc })
    .from(t.speakers)
    .where(and(eq(t.speakers.eventId, eventId), eq(t.speakers.status, "confirmed")));
  const sp = speakers.find((x) => x.name === DEMO_SPEAKER) ?? speakers[0];
  if (sp)
    personas.push({
      key: "speaker",
      name: sp.name,
      role: "Speaker",
      phone: phoneOf(sp.phoneEnc),
      items: newestLast(await inbox(client, eventId, { type: "speaker", id: sp.id })),
    });
  return { personas };
}
