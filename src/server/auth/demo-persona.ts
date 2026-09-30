/**
 * DEMO_MODE only: sign in as a seeded persona without an OTP, so judges and the team can
 * switch roles on stage. The plugin is not registered at all when DEMO_MODE is off.
 */
import { and, eq } from "drizzle-orm";
import { createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import type { BetterAuthPlugin } from "better-auth";
import { z } from "zod";
import { DemoPersona } from "@/contracts/api";
import { db } from "@/db/client";
import { events, memberships, users } from "@/db/schema";

/** Login emails of the seeded personas (blueprint Section 11). */
export const PERSONA_EMAILS: Record<DemoPersona, string> = {
  owner: "vedant@sutradhar.test",
  program_lead: "abhinav@sutradhar.test",
  comms_lead: "thanishka@sutradhar.test",
  faculty: "dr.rao@sutradhar.test",
  volunteer: "ravi@sutradhar.test",
  attendee: "sneha@sutradhar.test",
  sponsor: "partners@acme.test",
  viewer: "judge@sutradhar.test",
};

export function demoModeOn(): boolean {
  return process.env.DEMO_MODE === "true" || process.env.DEMO_MODE === "1";
}

export const demoPersonaPlugin = (): BetterAuthPlugin => ({
  id: "demo-persona",
  endpoints: {
    demoSwitchPersona: createAuthEndpoint(
      "/demo/switch-persona",
      {
        method: "POST",
        body: z.object({ persona: DemoPersona, eventSlug: z.string().max(64).optional() }),
      },
      async (ctx) => {
        if (!demoModeOn()) throw ctx.error("NOT_FOUND");
        const email = PERSONA_EMAILS[ctx.body.persona];
        const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
        if (!user) throw ctx.error("NOT_FOUND", { message: "Persona not seeded. Run pnpm demo:reset." });
        const slug = ctx.body.eventSlug ?? "hacknova-2026";
        const [ev] = await db.select({ id: events.id }).from(events).where(eq(events.slug, slug)).limit(1);
        if (!ev) throw ctx.error("NOT_FOUND", { message: "Event not found" });
        const [m] = await db
          .select({ id: memberships.id })
          .from(memberships)
          .where(and(eq(memberships.userId, user.id), eq(memberships.eventId, ev.id)))
          .limit(1);
        if (!m) throw ctx.error("FORBIDDEN", { message: "This persona is not part of that event" });

        const session = await ctx.context.internalAdapter.createSession(user.id, false, {
          activeEventId: ev.id,
        });
        await setSessionCookie(ctx, { session, user });
        return ctx.json({ userId: user.id, eventId: ev.id });
      },
    ),
  },
});
