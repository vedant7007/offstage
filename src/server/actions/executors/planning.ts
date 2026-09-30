import { and, eq, sql, type SQL } from "drizzle-orm";
import * as t from "@/db/schema";
import { istDateKey } from "@/lib/time";
import { bumpVersion } from "@/db/versioning";
import { ExecutionError, impact, type Executor, type Tx } from "../types";
import { mustLoad } from "./_util";

// ---------------------------------------------------------------- milestones

export const createMilestone: Executor<"plan.milestone.create"> = {
  kind: "plan.milestone.create",
  async describe(p) {
    return {
      diff: [
        {
          entity: "milestones",
          id: null,
          before: null,
          after: { title: p.title, domain: p.domain, dueOn: p.dueOn, ownerRole: p.ownerRole },
        },
      ],
      impact: impact(),
      preconditions: [],
    };
  },
  async execute(p, ctx) {
    for (const id of p.dependsOn) await mustLoad(ctx.db, t.milestones, id, ctx.eventId, "Milestone");
    const [row] = await ctx.db
      .insert(t.milestones)
      .values({
        eventId: ctx.eventId,
        title: p.title,
        domain: p.domain,
        dueOn: p.dueOn,
        ownerRole: p.ownerRole,
        dependsOn: p.dependsOn,
        critical: p.critical,
        notes: p.notes ?? null,
      })
      .returning({ id: t.milestones.id });
    ctx.emit({
      type: "milestone.created",
      entity: "milestones",
      entityId: row!.id,
      payload: { milestoneId: row!.id, dueOn: p.dueOn, critical: p.critical },
    });
    return { undoData: { milestoneId: row!.id } };
  },
  async inverse(_p, u, ctx) {
    await ctx.db
      .delete(t.milestones)
      .where(and(eq(t.milestones.id, u.milestoneId as string), eq(t.milestones.eventId, ctx.eventId)));
  },
};

export const updateMilestone: Executor<"plan.milestone.update"> = {
  kind: "plan.milestone.update",
  async describe(p, ctx) {
    const m = await mustLoad(ctx.db, t.milestones, p.milestoneId, ctx.eventId, "Milestone");
    const { milestoneId: _, ...after } = p;
    return {
      diff: [
        {
          entity: "milestones",
          id: m.id,
          before: {
            title: m.title,
            status: m.status,
            dueOn: m.dueOn,
            ownerRole: m.ownerRole,
            notes: m.notes,
          },
          after,
        },
      ],
      impact: impact(),
      preconditions: [{ entity: "milestones", id: m.id, version: m.version }],
    };
  },
  async execute(p, ctx) {
    const m = await mustLoad(ctx.db, t.milestones, p.milestoneId, ctx.eventId, "Milestone");
    const status = p.status ?? m.status;
    await ctx.db
      .update(t.milestones)
      .set({
        title: p.title ?? m.title,
        status,
        dueOn: p.dueOn ?? m.dueOn,
        ownerRole: p.ownerRole ?? m.ownerRole,
        notes: p.notes ?? m.notes,
        completedAt: status === "done" ? (m.completedAt ?? ctx.now) : null,
        version: bumpVersion(t.milestones),
      })
      .where(eq(t.milestones.id, m.id));
    ctx.emit({
      type: "milestone.updated",
      entity: "milestones",
      entityId: m.id,
      payload: { milestoneId: m.id, before: { status: m.status }, after: { status } },
    });
    return {
      undoData: {
        title: m.title,
        status: m.status,
        dueOn: m.dueOn,
        ownerRole: m.ownerRole,
        notes: m.notes,
        completedAt: m.completedAt?.toISOString() ?? null,
      },
    };
  },
  async inverse(p, u, ctx) {
    await ctx.db
      .update(t.milestones)
      .set({
        title: u.title as string,
        status: u.status as string,
        dueOn: u.dueOn as string,
        ownerRole: u.ownerRole as string,
        notes: (u.notes as string | null) ?? null,
        completedAt: u.completedAt ? new Date(u.completedAt as string) : null,
        version: bumpVersion(t.milestones),
      })
      .where(and(eq(t.milestones.id, p.milestoneId), eq(t.milestones.eventId, ctx.eventId)));
  },
};

// ---------------------------------------------------------------- post-event

const inr = (n: number) => `${Math.round(n).toLocaleString("en-IN")} INR`;

async function rowsOf<T extends Record<string, unknown>>(db: Tx, query: SQL): Promise<T[]> {
  return [...(await db.execute<T>(query))] as T[];
}

async function count(db: Tx, query: SQL): Promise<number> {
  return Number((await rowsOf<{ n: number | null }>(db, query))[0]?.n ?? 0);
}

/** Every number in a report comes from one of these queries, never from a model. */
async function reportMarkdown(db: Tx, eventId: string, kind: string, sponsorId?: string): Promise<string> {
  const lines: string[] = [];
  if (kind === "final" || kind === "feedback") {
    if (kind === "final") {
      const regs = await rowsOf<{ status: string; n: number }>(
        db,
        sql`select status, count(*)::int as n from registrations where event_id = ${eventId} group by status order by status`,
      );
      const checkedIn = await count(
        db,
        sql`select count(*)::int as n from registrations where event_id = ${eventId} and checked_in_at is not null`,
      );
      const sessions = await count(
        db,
        sql`select count(*)::int as n from sessions where event_id = ${eventId} and status <> 'cancelled'`,
      );
      const incidents = await count(
        db,
        sql`select count(*)::int as n from incidents where event_id = ${eventId}`,
      );
      lines.push(
        "## Registrations",
        ...regs.map((r) => `- ${r.status}: ${r.n}`),
        `- checked in: ${checkedIn}`,
      );
      lines.push("", "## Program", `- sessions held: ${sessions}`, `- incidents logged: ${incidents}`, "");
    }
    const fb = await rowsOf<{ n: number; avg: number | null }>(
      db,
      sql`select count(*)::int as n, round(avg(rating)::numeric, 2)::float as avg from feedback where event_id = ${eventId}`,
    );
    const dist = await rowsOf<{ rating: number; n: number }>(
      db,
      sql`select rating, count(*)::int as n from feedback where event_id = ${eventId} group by rating order by rating desc`,
    );
    lines.push(
      "## Feedback",
      `- responses: ${fb[0]?.n ?? 0}`,
      `- average rating: ${fb[0]?.avg ?? "none yet"}`,
    );
    lines.push(...dist.map((d) => `- ${d.rating} stars: ${d.n}`), "");
  }
  if (kind === "final" || kind === "settlement") {
    const money = await rowsOf<{ type: string; status: string; total: number }>(
      db,
      sql`select type, status, coalesce(sum(amount_inr), 0)::float as total from ledger_entries where event_id = ${eventId} group by type, status order by type, status`,
    );
    lines.push("## Money", ...money.map((m) => `- ${m.type} (${m.status}): ${inr(m.total)}`), "");
    if (kind === "settlement") {
      const cats = await rowsOf<{ name: string; cap: number; used: number }>(
        db,
        sql`select c.name, c.cap_inr::float as cap, coalesce(sum(case when l.type = 'expense' then l.amount_inr when l.type = 'refund' then -l.amount_inr else 0 end), 0)::float as used
            from budget_categories c left join ledger_entries l on l.category_id = c.id
            where c.event_id = ${eventId} group by c.id, c.name, c.cap_inr order by c.name`,
      );
      lines.push("## By category", ...cats.map((c) => `- ${c.name}: ${inr(c.used)} of ${inr(c.cap)}`), "");
    }
  }
  if (kind === "sponsor") {
    if (!sponsorId) throw new ExecutionError("A sponsor report needs a sponsorId");
    const [s] = await rowsOf<{ name: string; stage: string; committed: number | null }>(
      db,
      sql`select name, stage, committed_inr::float as committed from sponsor_prospects where id = ${sponsorId} and event_id = ${eventId}`,
    );
    if (!s) throw new ExecutionError(`Sponsor ${sponsorId} not found in this event`);
    const dels = await rowsOf<{ title: string; status: string }>(
      db,
      sql`select title, status from sponsor_deliverables where prospect_id = ${sponsorId} order by title`,
    );
    const received = await count(
      db,
      sql`select coalesce(sum(amount_inr), 0)::float as n from ledger_entries where event_id = ${eventId} and sponsor_id = ${sponsorId} and status = 'received'`,
    );
    const attendees = await count(
      db,
      sql`select count(*)::int as n from registrations where event_id = ${eventId} and checked_in_at is not null`,
    );
    lines.push(`## ${s.name}`, `- stage: ${s.stage}`, `- committed: ${inr(s.committed ?? 0)}`);
    lines.push(`- received: ${inr(received)}`, `- attendees reached (checked in): ${attendees}`, "");
    lines.push(
      "## Deliverables",
      ...(dels.length ? dels.map((d) => `- ${d.title}: ${d.status}`) : ["- none"]),
      "",
    );
  }
  return lines.join("\n").trim();
}

const REPORT_TITLES = {
  final: "Final report",
  sponsor: "Sponsor report",
  feedback: "Feedback report",
  settlement: "Settlement report",
} as const;

// Reports are stored as staff-only kb documents: briefings are fixed daily sections, and a kb
// document keeps the markdown next to the rest of the event's paperwork. Status 'ready' with no
// kb event means the ingest job never chunks it into helpdesk answers.
export const generateReport: Executor<"report.generate"> = {
  kind: "report.generate",
  async describe(p, ctx) {
    if (p.kind === "sponsor") {
      if (!p.sponsorId) throw new ExecutionError("A sponsor report needs a sponsorId");
      await mustLoad(ctx.db, t.sponsorProspects, p.sponsorId, ctx.eventId, "Sponsor");
    }
    return {
      diff: [
        {
          entity: "kb_documents",
          id: null,
          before: null,
          after: { title: REPORT_TITLES[p.kind], kind: "other", public: false },
        },
      ],
      impact: impact(),
      preconditions: [],
    };
  },
  async execute(p, ctx) {
    const body = await reportMarkdown(ctx.db, ctx.eventId, p.kind, p.sponsorId);
    const [row] = await ctx.db
      .insert(t.kbDocuments)
      .values({
        eventId: ctx.eventId,
        title: `${REPORT_TITLES[p.kind]}, ${istDateKey(ctx.now)}`,
        kind: "other",
        mimeType: "text/markdown",
        content: body,
        public: false,
        status: "ready",
      })
      .returning({ id: t.kbDocuments.id });
    return { undoData: { documentId: row!.id } };
  },
  async inverse(_p, u, ctx) {
    await ctx.db
      .delete(t.kbDocuments)
      .where(and(eq(t.kbDocuments.id, u.documentId as string), eq(t.kbDocuments.eventId, ctx.eventId)));
  },
};

export const addLesson: Executor<"playbook.add_lesson"> = {
  kind: "playbook.add_lesson",
  async describe(p) {
    return {
      diff: [
        {
          entity: "playbook_lessons",
          id: null,
          before: null,
          after: { eventType: p.eventType, title: p.title, tags: p.tags },
        },
      ],
      impact: impact(),
      preconditions: [],
    };
  },
  async execute(p, ctx) {
    const [row] = await ctx.db
      .insert(t.playbookLessons)
      .values({
        orgId: ctx.orgId,
        eventType: p.eventType,
        title: p.title,
        lesson: p.lesson,
        tags: p.tags,
        evidenceRefs: p.evidenceRefs,
        sourceEventId: ctx.eventId,
      })
      .returning({ id: t.playbookLessons.id });
    return { undoData: { lessonId: row!.id } };
  },
  async inverse(_p, u, ctx) {
    await ctx.db
      .delete(t.playbookLessons)
      .where(and(eq(t.playbookLessons.id, u.lessonId as string), eq(t.playbookLessons.orgId, ctx.orgId)));
  },
};
