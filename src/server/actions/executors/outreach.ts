import { and, eq, inArray } from "drizzle-orm";
import * as t from "@/db/schema";
import { bumpVersion } from "@/db/versioning";
import { istToUtc } from "@/lib/time";
import { impact, type Executor } from "../types";
import { iso, loadMany, mustLoad } from "./_util";

// ---------------------------------------------------------------- sponsors

/** Stored as a touchpoint with the body in draftBody. Nothing is sent to the sponsor. */
export const draftOutreach: Executor<"sponsor.outreach.draft"> = {
  kind: "sponsor.outreach.draft",
  async describe(p, ctx) {
    const s = await mustLoad(ctx.db, t.sponsorProspects, p.prospectId, ctx.eventId, "Sponsor");
    return {
      diff: [
        {
          entity: "sponsor_touchpoints",
          id: null,
          before: null,
          after: { prospectId: s.id, kind: "email", summary: p.subject, draft: true },
        },
      ],
      impact: impact(),
      preconditions: [],
    };
  },
  async execute(p, ctx) {
    await mustLoad(ctx.db, t.sponsorProspects, p.prospectId, ctx.eventId, "Sponsor");
    const [row] = await ctx.db
      .insert(t.sponsorTouchpoints)
      .values({
        eventId: ctx.eventId,
        prospectId: p.prospectId,
        kind: "email",
        direction: "out",
        summary: `Draft: ${p.subject}`,
        draftBody: p.body,
      })
      .returning({ id: t.sponsorTouchpoints.id });
    return { undoData: { touchpointId: row!.id } };
  },
  async inverse(_p, u, ctx) {
    await ctx.db
      .delete(t.sponsorTouchpoints)
      .where(
        and(
          eq(t.sponsorTouchpoints.id, u.touchpointId as string),
          eq(t.sponsorTouchpoints.eventId, ctx.eventId),
        ),
      );
  },
};

export const scheduleFollowup: Executor<"sponsor.followup.schedule"> = {
  kind: "sponsor.followup.schedule",
  async describe(p, ctx) {
    const s = await mustLoad(ctx.db, t.sponsorProspects, p.prospectId, ctx.eventId, "Sponsor");
    return {
      diff: [
        {
          entity: "sponsor_prospects",
          id: s.id,
          before: { nextFollowUpAt: iso(s.nextFollowUpAt) },
          after: { nextFollowUpAt: p.dueAt },
        },
      ],
      impact: impact(),
      preconditions: [{ entity: "sponsor_prospects", id: s.id, version: s.version }],
    };
  },
  async execute(p, ctx) {
    const s = await mustLoad(ctx.db, t.sponsorProspects, p.prospectId, ctx.eventId, "Sponsor");
    await ctx.db
      .update(t.sponsorProspects)
      .set({ nextFollowUpAt: new Date(p.dueAt), version: bumpVersion(t.sponsorProspects) })
      .where(eq(t.sponsorProspects.id, s.id));
    let touchpointId: string | null = null;
    if (p.note) {
      const [row] = await ctx.db
        .insert(t.sponsorTouchpoints)
        .values({ eventId: ctx.eventId, prospectId: s.id, kind: "note", direction: "out", summary: p.note })
        .returning({ id: t.sponsorTouchpoints.id });
      touchpointId = row!.id;
    }
    return { undoData: { nextFollowUpAt: iso(s.nextFollowUpAt), touchpointId } };
  },
  async inverse(p, u, ctx) {
    await ctx.db
      .update(t.sponsorProspects)
      .set({
        nextFollowUpAt: u.nextFollowUpAt ? new Date(u.nextFollowUpAt as string) : null,
        version: bumpVersion(t.sponsorProspects),
      })
      .where(and(eq(t.sponsorProspects.id, p.prospectId), eq(t.sponsorProspects.eventId, ctx.eventId)));
    if (u.touchpointId)
      await ctx.db.delete(t.sponsorTouchpoints).where(eq(t.sponsorTouchpoints.id, u.touchpointId as string));
  },
};

export const updateDeliverable: Executor<"sponsor.deliverable.update"> = {
  kind: "sponsor.deliverable.update",
  async describe(p, ctx) {
    await mustLoad(ctx.db, t.sponsorProspects, p.prospectId, ctx.eventId, "Sponsor");
    const after = { title: p.title, status: p.status, evidenceRef: p.evidenceRef ?? null };
    if (p.deliverableId) {
      const d = await mustLoad(ctx.db, t.sponsorDeliverables, p.deliverableId, ctx.eventId, "Deliverable");
      return {
        diff: [
          {
            entity: "sponsor_deliverables",
            id: d.id,
            before: { title: d.title, status: d.status, evidenceRef: d.evidenceRef },
            after,
          },
        ],
        impact: impact(),
        preconditions: [{ entity: "sponsor_deliverables", id: d.id, version: d.version }],
      };
    }
    return {
      diff: [{ entity: "sponsor_deliverables", id: null, before: null, after }],
      impact: impact(),
      preconditions: [],
    };
  },
  async execute(p, ctx) {
    await mustLoad(ctx.db, t.sponsorProspects, p.prospectId, ctx.eventId, "Sponsor");
    if (p.deliverableId) {
      const d = await mustLoad(ctx.db, t.sponsorDeliverables, p.deliverableId, ctx.eventId, "Deliverable");
      await ctx.db
        .update(t.sponsorDeliverables)
        .set({
          title: p.title,
          status: p.status,
          evidenceRef: p.evidenceRef ?? d.evidenceRef,
          version: bumpVersion(t.sponsorDeliverables),
        })
        .where(eq(t.sponsorDeliverables.id, d.id));
      return {
        undoData: { deliverableId: d.id, title: d.title, status: d.status, evidenceRef: d.evidenceRef },
      };
    }
    const [row] = await ctx.db
      .insert(t.sponsorDeliverables)
      .values({
        eventId: ctx.eventId,
        prospectId: p.prospectId,
        title: p.title,
        status: p.status,
        evidenceRef: p.evidenceRef ?? null,
      })
      .returning({ id: t.sponsorDeliverables.id });
    return { undoData: { deliverableId: row!.id, created: true } };
  },
  async inverse(_p, u, ctx) {
    const where = and(
      eq(t.sponsorDeliverables.id, u.deliverableId as string),
      eq(t.sponsorDeliverables.eventId, ctx.eventId),
    );
    if (u.created) {
      await ctx.db.delete(t.sponsorDeliverables).where(where);
      return;
    }
    await ctx.db
      .update(t.sponsorDeliverables)
      .set({
        title: u.title as string,
        status: u.status as string,
        evidenceRef: (u.evidenceRef as string | null) ?? null,
        version: bumpVersion(t.sponsorDeliverables),
      })
      .where(where);
  },
};

// ---------------------------------------------------------------- marketing

export const draftPost: Executor<"marketing.post.draft"> = {
  kind: "marketing.post.draft",
  async describe(p) {
    return {
      diff: [
        {
          entity: "marketing_posts",
          id: null,
          before: null,
          after: { platform: p.platform, status: "draft", scheduledFor: p.scheduledFor ?? null },
        },
      ],
      impact: impact(),
      preconditions: [],
    };
  },
  async execute(p, ctx) {
    const [row] = await ctx.db
      .insert(t.marketingPosts)
      .values({
        eventId: ctx.eventId,
        platform: p.platform,
        body: p.body,
        hashtags: p.hashtags,
        posterBrief: p.posterBrief ?? null,
        scheduledFor: p.scheduledFor ? new Date(p.scheduledFor) : null,
        proposalId: ctx.proposalId,
      })
      .returning({ id: t.marketingPosts.id });
    ctx.emit({
      type: "marketing.post_drafted",
      entity: "marketing_posts",
      entityId: row!.id,
      payload: { postId: row!.id, platform: p.platform },
    });
    return { undoData: { postId: row!.id } };
  },
  async inverse(_p, u, ctx) {
    await ctx.db
      .delete(t.marketingPosts)
      .where(and(eq(t.marketingPosts.id, u.postId as string), eq(t.marketingPosts.eventId, ctx.eventId)));
  },
};

/** Entries with a postId reschedule that post; the rest become draft placeholders holding the theme. */
export const setCalendar: Executor<"marketing.calendar.set"> = {
  kind: "marketing.calendar.set",
  async describe(p, ctx) {
    const ids = p.entries.flatMap((e) => (e.postId ? [e.postId] : []));
    const posts = await loadMany(ctx.db, t.marketingPosts, ids, ctx.eventId);
    return {
      diff: p.entries.map((e) => {
        const cur = posts.find((x) => x.id === e.postId);
        return {
          entity: "marketing_posts",
          id: cur?.id ?? null,
          before: cur ? { scheduledFor: iso(cur.scheduledFor) } : null,
          after: { date: e.date, platform: e.platform, theme: e.theme },
        };
      }),
      impact: impact(),
      preconditions: posts.map((x) => ({ entity: "marketing_posts", id: x.id, version: x.version })),
    };
  },
  async execute(p, ctx) {
    const previous: { id: string; scheduledFor: string | null }[] = [];
    const created: string[] = [];
    for (const e of p.entries) {
      const at = istToUtc(e.date);
      if (e.postId) {
        const post = await mustLoad(ctx.db, t.marketingPosts, e.postId, ctx.eventId, "Post");
        previous.push({ id: post.id, scheduledFor: iso(post.scheduledFor) });
        await ctx.db
          .update(t.marketingPosts)
          .set({ scheduledFor: at, version: bumpVersion(t.marketingPosts) })
          .where(eq(t.marketingPosts.id, post.id));
      } else {
        const [row] = await ctx.db
          .insert(t.marketingPosts)
          .values({
            eventId: ctx.eventId,
            platform: e.platform,
            body: e.theme,
            scheduledFor: at,
            proposalId: ctx.proposalId,
          })
          .returning({ id: t.marketingPosts.id });
        created.push(row!.id);
      }
    }
    return { undoData: { previous, created } };
  },
  async inverse(_p, u, ctx) {
    for (const x of u.previous as { id: string; scheduledFor: string | null }[])
      await ctx.db
        .update(t.marketingPosts)
        .set({
          scheduledFor: x.scheduledFor ? new Date(x.scheduledFor) : null,
          version: bumpVersion(t.marketingPosts),
        })
        .where(and(eq(t.marketingPosts.id, x.id), eq(t.marketingPosts.eventId, ctx.eventId)));
    const created = u.created as string[];
    if (created.length)
      await ctx.db
        .delete(t.marketingPosts)
        .where(and(inArray(t.marketingPosts.id, created), eq(t.marketingPosts.eventId, ctx.eventId)));
  },
};

// A push suggestion is an action for the team, not a post: marketing_posts needs a platform and
// publishable copy, so each suggestion becomes an unassigned task the marketing lead can pick up.
export const suggestPush: Executor<"marketing.push.suggest"> = {
  kind: "marketing.push.suggest",
  async describe(p) {
    return {
      diff: p.suggestions.map((s) => ({
        entity: "tasks",
        id: null,
        before: null,
        after: { title: s.action, segment: s.segment },
      })),
      impact: impact(),
      preconditions: [],
    };
  },
  async execute(p, ctx) {
    const rows = await ctx.db
      .insert(t.tasks)
      .values(
        p.suggestions.map((s) => ({
          eventId: ctx.eventId,
          title: s.action,
          description: `Reach: ${s.segment}\nWhy: ${s.reason}\nRegistrations: ${p.actual} of ${p.target}`,
          priority: "normal",
        })),
      )
      .returning({ id: t.tasks.id });
    return { undoData: { taskIds: rows.map((r) => r.id) } };
  },
  async inverse(_p, u, ctx) {
    await ctx.db
      .update(t.tasks)
      .set({ status: "cancelled", version: bumpVersion(t.tasks) })
      .where(and(inArray(t.tasks.id, u.taskIds as string[]), eq(t.tasks.eventId, ctx.eventId)));
  },
};
