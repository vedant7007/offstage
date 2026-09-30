import { and, asc, eq, inArray, sql } from "drizzle-orm";
import * as t from "@/db/schema";
import { bumpVersion } from "@/db/versioning";
import { ExecutionError, impact, type Executor } from "../types";
import { mustLoad } from "./_util";

export const assignShift: Executor<"crew.assign_shift"> = {
  kind: "crew.assign_shift",
  async describe(p, ctx) {
    const shift = await mustLoad(ctx.db, t.shifts, p.shiftId, ctx.eventId, "Shift");
    const vol = await mustLoad(ctx.db, t.volunteers, p.volunteerId, ctx.eventId, "Volunteer");
    return {
      diff: [
        {
          entity: "shift_assignments",
          id: null,
          before: null,
          after: { shiftId: shift.id, volunteerId: vol.id, status: "assigned" },
        },
        ...(p.replacesVolunteerId
          ? [
              {
                entity: "shift_assignments",
                id: null,
                before: { volunteerId: p.replacesVolunteerId },
                after: { volunteerId: p.replacesVolunteerId, status: "released" },
              },
            ]
          : []),
      ],
      impact: impact({ people: 1, volunteers: 1, channels: ["in_app"] }),
      preconditions: [
        { entity: "shifts", id: shift.id, version: shift.version },
        { entity: "volunteers", id: vol.id, version: vol.version },
      ],
    };
  },
  async execute(p, ctx) {
    await mustLoad(ctx.db, t.shifts, p.shiftId, ctx.eventId, "Shift");
    const vol = await mustLoad(ctx.db, t.volunteers, p.volunteerId, ctx.eventId, "Volunteer");
    if (!vol.active) throw new ExecutionError("Volunteer is not active");
    const [existing] = await ctx.db
      .select()
      .from(t.shiftAssignments)
      .where(
        and(eq(t.shiftAssignments.shiftId, p.shiftId), eq(t.shiftAssignments.volunteerId, p.volunteerId)),
      );
    let assignmentId: string;
    let previousStatus: string | null = null;
    if (existing) {
      if (existing.status === "assigned" || existing.status === "checked_in")
        throw new ExecutionError("Volunteer is already on this shift");
      previousStatus = existing.status;
      await ctx.db
        .update(t.shiftAssignments)
        .set({ status: "assigned", version: bumpVersion(t.shiftAssignments) })
        .where(eq(t.shiftAssignments.id, existing.id));
      assignmentId = existing.id;
    } else {
      const [row] = await ctx.db
        .insert(t.shiftAssignments)
        .values({ eventId: ctx.eventId, shiftId: p.shiftId, volunteerId: p.volunteerId })
        .returning({ id: t.shiftAssignments.id });
      assignmentId = row!.id;
    }
    let replaced: { id: string; status: string } | null = null;
    if (p.replacesVolunteerId) {
      const [old] = await ctx.db
        .select()
        .from(t.shiftAssignments)
        .where(
          and(
            eq(t.shiftAssignments.shiftId, p.shiftId),
            eq(t.shiftAssignments.volunteerId, p.replacesVolunteerId),
          ),
        );
      if (old && old.status !== "missed") {
        await ctx.db
          .update(t.shiftAssignments)
          .set({ status: "released", version: bumpVersion(t.shiftAssignments) })
          .where(eq(t.shiftAssignments.id, old.id));
        replaced = { id: old.id, status: old.status };
      }
    }
    ctx.emit({
      type: "shift.assigned",
      entity: "shift_assignments",
      entityId: assignmentId,
      payload: {
        shiftId: p.shiftId,
        volunteerId: p.volunteerId,
        assignmentId,
        replacesVolunteerId: p.replacesVolunteerId,
      },
    });
    return { undoData: { assignmentId, created: !existing, previousStatus, replaced } };
  },
  async inverse(_p, undo, ctx) {
    const id = undo.assignmentId as string;
    if (undo.created)
      await ctx.db
        .delete(t.shiftAssignments)
        .where(and(eq(t.shiftAssignments.id, id), eq(t.shiftAssignments.eventId, ctx.eventId)));
    else
      await ctx.db
        .update(t.shiftAssignments)
        .set({ status: undo.previousStatus as string, version: bumpVersion(t.shiftAssignments) })
        .where(eq(t.shiftAssignments.id, id));
    const replaced = undo.replaced as { id: string; status: string } | null;
    if (replaced)
      await ctx.db
        .update(t.shiftAssignments)
        .set({ status: replaced.status, version: bumpVersion(t.shiftAssignments) })
        .where(eq(t.shiftAssignments.id, replaced.id));
  },
};

export const unassignShift: Executor<"crew.unassign_shift"> = {
  kind: "crew.unassign_shift",
  async describe(p, ctx) {
    const a = await assignmentOf(ctx, p.shiftId, p.volunteerId);
    return {
      diff: [
        {
          entity: "shift_assignments",
          id: a.id,
          before: { status: a.status },
          after: { status: "released" },
        },
      ],
      impact: impact({ people: 1, volunteers: 1, channels: ["in_app"] }),
      preconditions: [{ entity: "shift_assignments", id: a.id, version: a.version }],
    };
  },
  async execute(p, ctx) {
    const a = await assignmentOf(ctx, p.shiftId, p.volunteerId);
    await ctx.db
      .update(t.shiftAssignments)
      .set({ status: "released", version: bumpVersion(t.shiftAssignments) })
      .where(eq(t.shiftAssignments.id, a.id));
    ctx.emit({
      type: "shift.unassigned",
      entity: "shift_assignments",
      entityId: a.id,
      payload: { shiftId: p.shiftId, volunteerId: p.volunteerId, reason: p.reason },
    });
    return { undoData: { assignmentId: a.id, status: a.status } };
  },
  async inverse(_p, undo, ctx) {
    await ctx.db
      .update(t.shiftAssignments)
      .set({ status: undo.status as string, version: bumpVersion(t.shiftAssignments) })
      .where(
        and(
          eq(t.shiftAssignments.id, undo.assignmentId as string),
          eq(t.shiftAssignments.eventId, ctx.eventId),
        ),
      );
  },
};

async function assignmentOf(
  ctx: { db: Parameters<typeof mustLoad>[0]; eventId: string },
  shiftId: string,
  volunteerId: string,
) {
  const [a] = await ctx.db
    .select()
    .from(t.shiftAssignments)
    .where(
      and(
        eq(t.shiftAssignments.shiftId, shiftId),
        eq(t.shiftAssignments.volunteerId, volunteerId),
        eq(t.shiftAssignments.eventId, ctx.eventId),
      ),
    );
  if (!a) throw new ExecutionError("That volunteer is not on that shift");
  return a;
}

export const createShift: Executor<"crew.create_shift"> = {
  kind: "crew.create_shift",
  async describe(p) {
    if (new Date(p.endsAt) <= new Date(p.startsAt))
      throw new ExecutionError("The end must be after the start");
    return {
      diff: [
        {
          entity: "shifts",
          id: null,
          before: null,
          after: { role: p.role, startsAt: p.startsAt, endsAt: p.endsAt, requiredCount: p.requiredCount },
        },
      ],
      impact: impact(),
      preconditions: [],
    };
  },
  async execute(p, ctx) {
    const [row] = await ctx.db
      .insert(t.shifts)
      .values({
        eventId: ctx.eventId,
        role: p.role,
        roomId: p.roomId ?? null,
        sessionId: p.sessionId ?? null,
        startsAt: new Date(p.startsAt),
        endsAt: new Date(p.endsAt),
        requiredCount: p.requiredCount,
        skills: p.skills,
      })
      .returning({ id: t.shifts.id });
    ctx.emit({
      type: "shift.created",
      entity: "shifts",
      entityId: row!.id,
      payload: { shiftId: row!.id, role: p.role },
    });
    return { undoData: { shiftId: row!.id } };
  },
  async inverse(_p, undo, ctx) {
    await ctx.db
      .delete(t.shifts)
      .where(and(eq(t.shifts.id, undo.shiftId as string), eq(t.shifts.eventId, ctx.eventId)));
  },
};

export const createTask: Executor<"crew.create_task"> = {
  kind: "crew.create_task",
  async describe(p, ctx) {
    if (p.assigneeVolunteerId)
      await mustLoad(ctx.db, t.volunteers, p.assigneeVolunteerId, ctx.eventId, "Volunteer");
    return {
      diff: [
        {
          entity: "tasks",
          id: null,
          before: null,
          after: {
            title: p.title,
            assigneeVolunteerId: p.assigneeVolunteerId ?? null,
            skill: p.skill ?? null,
          },
        },
      ],
      impact: impact({
        people: p.assigneeVolunteerId || p.skill ? 1 : 0,
        volunteers: p.assigneeVolunteerId || p.skill ? 1 : 0,
        channels: ["in_app"],
      }),
      preconditions: [],
    };
  },
  async execute(p, ctx) {
    let assignee = p.assigneeVolunteerId ?? null;
    if (!assignee && p.skill) {
      // Least busy active volunteer with the skill.
      const rows = await ctx.db
        .select({
          id: t.volunteers.id,
          open: sql<number>`(select count(*)::int from tasks x where x.assignee_volunteer_id = ${t.volunteers.id} and x.status in ('open','in_progress'))`,
        })
        .from(t.volunteers)
        .where(
          and(
            eq(t.volunteers.eventId, ctx.eventId),
            eq(t.volunteers.active, true),
            sql`${p.skill} = any(${t.volunteers.skills})`,
          ),
        )
        .orderBy(asc(sql`2`), asc(t.volunteers.id))
        .limit(1);
      assignee = rows[0]?.id ?? null;
    }
    const [row] = await ctx.db
      .insert(t.tasks)
      .values({
        eventId: ctx.eventId,
        title: p.title,
        description: p.description ?? null,
        assigneeVolunteerId: assignee,
        skill: p.skill ?? null,
        roomId: p.roomId ?? null,
        incidentId: p.incidentId ?? null,
        priority: p.priority,
        dueAt: p.dueAt ? new Date(p.dueAt) : null,
      })
      .returning({ id: t.tasks.id });
    ctx.emit({
      type: "task.created",
      entity: "tasks",
      entityId: row!.id,
      payload: { taskId: row!.id, assigneeVolunteerId: assignee, incidentId: p.incidentId },
    });
    return { undoData: { taskId: row!.id } };
  },
  async inverse(_p, undo, ctx) {
    await ctx.db
      .update(t.tasks)
      .set({ status: "cancelled", version: bumpVersion(t.tasks) })
      .where(and(eq(t.tasks.id, undo.taskId as string), eq(t.tasks.eventId, ctx.eventId)));
  },
};

export const briefingDraft: Executor<"crew.briefing.draft"> = {
  kind: "crew.briefing.draft",
  async describe(p, ctx) {
    const rows = await ctx.db
      .select()
      .from(t.shifts)
      .where(and(eq(t.shifts.eventId, ctx.eventId), eq(t.shifts.role, p.role)));
    return {
      diff: rows.map((s) => ({
        entity: "shifts",
        id: s.id,
        before: { briefingMarkdown: s.briefingMarkdown },
        after: { briefingMarkdown: p.bodyMarkdown },
      })),
      impact: impact(),
      preconditions: rows.map((s) => ({ entity: "shifts", id: s.id, version: s.version })),
    };
  },
  async execute(p, ctx) {
    const rows = await ctx.db
      .select()
      .from(t.shifts)
      .where(and(eq(t.shifts.eventId, ctx.eventId), eq(t.shifts.role, p.role)));
    if (rows.length === 0) throw new ExecutionError(`No shifts with the role "${p.role}"`);
    await ctx.db
      .update(t.shifts)
      .set({ briefingMarkdown: `# ${p.title}\n\n${p.bodyMarkdown}`, version: bumpVersion(t.shifts) })
      .where(
        inArray(
          t.shifts.id,
          rows.map((s) => s.id),
        ),
      );
    return { undoData: { previous: rows.map((s) => ({ id: s.id, briefingMarkdown: s.briefingMarkdown })) } };
  },
  async inverse(_p, undo, ctx) {
    for (const s of undo.previous as { id: string; briefingMarkdown: string | null }[]) {
      await ctx.db
        .update(t.shifts)
        .set({ briefingMarkdown: s.briefingMarkdown, version: bumpVersion(t.shifts) })
        .where(and(eq(t.shifts.id, s.id), eq(t.shifts.eventId, ctx.eventId)));
    }
  },
};
