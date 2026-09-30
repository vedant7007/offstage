/**
 * Public (no login) reads: the event page, the status board, the scanner's verify key and the
 * revocation list. Built from loadWorld with the same builders the fixtures use, so the database
 * and NEXT_PUBLIC_API_MOCK give pages identical shapes. Only public fields leave this file.
 */
import { and, asc, eq } from "drizzle-orm";
import type {
  PublicEventResponse,
  PublicStatusResponse,
  RevocationListResponse,
  VerifyKeyResponse,
} from "@/contracts/api";
import type { EventWorld } from "@/contracts/fixtures";
import { publicEvent, publicStatus } from "@/contracts/fixtures/responses";
import { db } from "@/db/client";
import { events, kbDocuments, tickets } from "@/db/schema";
import { nowUtc } from "@/lib/time";
import { publicKeySpkiBase64 } from "@/server/checkin/ticket";
import { notFound } from "@/server/http";
import { loadWorld } from "./world";

/** Published events only; drafts and archived events 404 like unknown slugs. */
const PUBLIC_STATUSES = new Set(["planning", "live", "closed"]);

export async function eventBySlug(slug: string) {
  const [ev] = await db
    .select({ id: events.id, status: events.status, capacity: events.capacity })
    .from(events)
    .where(eq(events.slug, slug))
    .limit(1);
  if (!ev || !PUBLIC_STATUSES.has(ev.status)) throw notFound("Event not found");
  return ev;
}

// ponytail: per-process cache, fine for one web container; move to Postgres NOTIFY
// invalidation if we ever run several.
const TTL_MS = 5_000;
const worlds = new Map<string, { at: number; world: Promise<EventWorld> }>();

export function cachedWorld(eventId: string): Promise<EventWorld> {
  const hit = worlds.get(eventId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.world;
  const world = loadWorld(eventId);
  worlds.set(eventId, { at: Date.now(), world });
  world.catch(() => worlds.delete(eventId));
  return world;
}

/** Drop the cached world so the next read sees a write (after a registration, for example). */
export function invalidatePublic(eventId: string): void {
  worlds.delete(eventId);
}

const anchor = (heading: string) =>
  heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** FAQ entries from the event's public FAQ documents: each `## Question` and its first paragraph. */
async function faqFor(eventId: string): Promise<PublicEventResponse["faq"]> {
  const docs = await db
    .select({ id: kbDocuments.id, content: kbDocuments.content })
    .from(kbDocuments)
    .where(and(eq(kbDocuments.eventId, eventId), eq(kbDocuments.kind, "faq")))
    .orderBy(asc(kbDocuments.createdAt));
  const out: PublicEventResponse["faq"] = [];
  for (const doc of docs) {
    for (const block of doc.content.split(/^## /m).slice(1)) {
      const [heading = "", ...rest] = block.split("\n");
      const answer = rest
        .join("\n")
        .trim()
        .split(/\n\s*\n/)[0]
        ?.trim();
      if (heading.trim() && answer)
        out.push({ question: heading.trim(), answer, source: `kb:${doc.id}#${anchor(heading)}` });
    }
  }
  return out;
}

export async function getPublicEvent(slug: string): Promise<PublicEventResponse> {
  const ev = await eventBySlug(slug);
  const [world, faq] = await Promise.all([cachedWorld(ev.id), faqFor(ev.id)]);
  return { ...publicEvent(world), faq, generatedAt: nowUtc().toISOString() };
}

export async function getPublicStatus(slug: string): Promise<PublicStatusResponse> {
  const ev = await eventBySlug(slug);
  const world = await cachedWorld(ev.id);
  // The cache may be a few seconds old; "now" must not be.
  return publicStatus({ ...world, now: nowUtc().toISOString() });
}

export async function getVerifyKey(slug: string): Promise<VerifyKeyResponse> {
  const ev = await eventBySlug(slug);
  const publicKey = publicKeySpkiBase64();
  return { eventId: ev.id, algorithm: "Ed25519", publicKey, keyId: publicKey.slice(-12) };
}

export async function getRevocations(slug: string): Promise<RevocationListResponse> {
  const ev = await eventBySlug(slug);
  const rows = await db
    .select({ id: tickets.id })
    .from(tickets)
    .where(and(eq(tickets.eventId, ev.id), eq(tickets.revoked, true)));
  return { eventId: ev.id, revokedTicketIds: rows.map((r) => r.id), updatedAt: nowUtc().toISOString() };
}
