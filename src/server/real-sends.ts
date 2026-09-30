/**
 * The real-sends switch. Off (the default) makes the outbox mark every message delivered_mock, even
 * for DEMO_REAL_RECIPIENTS, so provider caps (the Twilio trial allows 50 messages a day) are saved
 * for the real demo. REAL_SENDS=on in the environment is the default; the console can override it at
 * runtime, stored in app_settings so the web app and the worker agree.
 */
import { eq } from "drizzle-orm";
import type { Actor } from "@/contracts";
import { db as defaultDb, type Db } from "@/db/client";
import { appSettings } from "@/db/schema";
import { audit } from "@/server/events/bus";

const KEY = "real_sends";

export interface RealSends {
  on: boolean;
  source: "env" | "console";
  changedAt?: string;
}

const envDefault = () => process.env.REAL_SENDS === "on";

export async function getRealSends(client: Pick<Db, "select"> = defaultDb): Promise<RealSends> {
  const [row] = await client.select().from(appSettings).where(eq(appSettings.key, KEY));
  const v = row?.value as { on?: unknown } | undefined;
  if (typeof v?.on === "boolean")
    return { on: v.on, source: "console", changedAt: row!.updatedAt.toISOString() };
  return { on: envDefault(), source: "env" };
}

export async function setRealSends(
  on: boolean,
  actor: Actor & { eventId: string },
  client: Db = defaultDb,
): Promise<RealSends> {
  await client.transaction(async (tx) => {
    const before = await getRealSends(tx);
    await tx
      .insert(appSettings)
      .values({ key: KEY, value: { on } })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: { on }, updatedAt: new Date() } });
    await audit(tx, {
      eventId: actor.eventId,
      actor,
      action: "settings.real_sends",
      entity: "app_settings",
      entityId: KEY,
      before: { on: before.on },
      after: { on },
    });
  });
  return getRealSends(client);
}
