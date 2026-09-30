import { and, eq, inArray } from "drizzle-orm";
import * as t from "@/db/schema";
import { bumpVersion } from "@/db/versioning";
import { ExecutionError, impact, type ExecCtx, type Executor } from "../types";
import { loadMany, mustLoad } from "./_util";

type ItemRow = { id: string; label: string; status: string; notes: string | null };

export const updateChecklist: Executor<"logistics.checklist.update"> = {
  kind: "logistics.checklist.update",
  async describe(p, ctx) {
    const c = p.checklistId
      ? await mustLoad(ctx.db, t.checklists, p.checklistId, ctx.eventId, "Checklist")
      : null;
    if (!c && !p.title) throw new ExecutionError("A new checklist needs a title");
    const items = await loadMany(
      ctx.db,
      t.checklistItems,
      p.items.flatMap((i) => (i.itemId ? [i.itemId] : [])),
      ctx.eventId,
    );
    return {
      diff: [
        {
          entity: "checklists",
          id: c?.id ?? null,
          before: c ? { title: c.title } : null,
          after: { title: p.title ?? c?.title, scope: p.scope },
        },
        ...p.items.map((i) => {
          const cur = items.find((x) => x.id === i.itemId);
          return {
            entity: "checklist_items",
            id: cur?.id ?? null,
            before: cur ? { label: cur.label, status: cur.status } : null,
            after: { label: i.label, status: i.status },
          };
        }),
      ],
      impact: impact(),
      preconditions: [
        ...(c ? [{ entity: "checklists", id: c.id, version: c.version }] : []),
        ...items.map((x) => ({ entity: "checklist_items", id: x.id, version: x.version })),
      ],
    };
  },
  async execute(p, ctx) {
    let checklistId = p.checklistId;
    let previousTitle: string | null = null;
    if (checklistId) {
      const c = await mustLoad(ctx.db, t.checklists, checklistId, ctx.eventId, "Checklist");
      previousTitle = c.title;
      if (p.title && p.title !== c.title)
        await ctx.db
          .update(t.checklists)
          .set({ title: p.title, version: bumpVersion(t.checklists) })
          .where(eq(t.checklists.id, c.id));
    } else {
      if (!p.title) throw new ExecutionError("A new checklist needs a title");
      const [row] = await ctx.db
        .insert(t.checklists)
        .values({
          eventId: ctx.eventId,
          title: p.title,
          scopeType: p.scope.type,
          scopeRef: p.scope.ref ?? null,
        })
        .returning({ id: t.checklists.id });
      checklistId = row!.id;
    }
    const previous: ItemRow[] = [];
    const created: string[] = [];
    for (const [ordinal, i] of p.items.entries()) {
      if (i.itemId) {
        const cur = await mustLoad(ctx.db, t.checklistItems, i.itemId, ctx.eventId, "Checklist item");
        if (cur.checklistId !== checklistId)
          throw new ExecutionError(`Item ${i.itemId} is not on this checklist`);
        previous.push({ id: cur.id, label: cur.label, status: cur.status, notes: cur.notes });
        await ctx.db
          .update(t.checklistItems)
          .set({
            label: i.label,
            status: i.status,
            notes: i.notes ?? cur.notes,
            version: bumpVersion(t.checklistItems),
          })
          .where(eq(t.checklistItems.id, cur.id));
      } else {
        const [row] = await ctx.db
          .insert(t.checklistItems)
          .values({
            eventId: ctx.eventId,
            checklistId,
            ordinal,
            label: i.label,
            status: i.status,
            notes: i.notes ?? null,
          })
          .returning({ id: t.checklistItems.id });
        created.push(row!.id);
      }
    }
    ctx.emit({
      type: "logistics.checklist_updated",
      entity: "checklists",
      entityId: checklistId,
      payload: { checklistId, items: p.items.length },
    });
    return { undoData: { checklistId, createdChecklist: !p.checklistId, previousTitle, previous, created } };
  },
  async inverse(_p, u, ctx) {
    const checklistId = u.checklistId as string;
    if (u.createdChecklist) {
      await ctx.db
        .delete(t.checklists)
        .where(and(eq(t.checklists.id, checklistId), eq(t.checklists.eventId, ctx.eventId)));
      return;
    }
    await ctx.db
      .update(t.checklists)
      .set({ title: u.previousTitle as string, version: bumpVersion(t.checklists) })
      .where(and(eq(t.checklists.id, checklistId), eq(t.checklists.eventId, ctx.eventId)));
    for (const i of u.previous as ItemRow[])
      await ctx.db
        .update(t.checklistItems)
        .set({ label: i.label, status: i.status, notes: i.notes, version: bumpVersion(t.checklistItems) })
        .where(and(eq(t.checklistItems.id, i.id), eq(t.checklistItems.eventId, ctx.eventId)));
    const created = u.created as string[];
    if (created.length)
      await ctx.db
        .delete(t.checklistItems)
        .where(and(inArray(t.checklistItems.id, created), eq(t.checklistItems.eventId, ctx.eventId)));
  },
};

// ---------------------------------------------------------------- inventory

type Counted = { id: string | null; name: string; count: number };

/** Find by id, else by exact name. */
async function findItem(ctx: Pick<ExecCtx, "db" | "eventId">, itemId: string | undefined, name: string) {
  if (itemId) return mustLoad(ctx.db, t.inventoryItems, itemId, ctx.eventId, "Inventory item");
  const [row] = await ctx.db
    .select()
    .from(t.inventoryItems)
    .where(and(eq(t.inventoryItems.eventId, ctx.eventId), eq(t.inventoryItems.name, name)));
  return row ?? null;
}

/** Set counts, creating missing items. Returns what undo needs. */
async function setCounts(
  ctx: ExecCtx,
  rows: { itemId?: string; name: string; unit?: string; next: (cur: number) => number }[],
) {
  const previous: { id: string; count: number }[] = [];
  const created: string[] = [];
  for (const r of rows) {
    const cur = await findItem(ctx, r.itemId, r.name);
    const count = r.next(cur?.count ?? 0);
    if (count < 0) throw new ExecutionError(`${r.name} would go below zero`);
    if (cur) {
      previous.push({ id: cur.id, count: cur.count });
      await ctx.db
        .update(t.inventoryItems)
        .set({ count, unit: r.unit ?? cur.unit, version: bumpVersion(t.inventoryItems) })
        .where(eq(t.inventoryItems.id, cur.id));
    } else {
      const [row] = await ctx.db
        .insert(t.inventoryItems)
        .values({ eventId: ctx.eventId, name: r.name, count, unit: r.unit ?? null })
        .returning({ id: t.inventoryItems.id });
      created.push(row!.id);
    }
  }
  return { previous, created };
}

async function restoreCounts(ctx: ExecCtx, u: Record<string, unknown>) {
  for (const x of u.previous as { id: string; count: number }[])
    await ctx.db
      .update(t.inventoryItems)
      .set({ count: x.count, version: bumpVersion(t.inventoryItems) })
      .where(and(eq(t.inventoryItems.id, x.id), eq(t.inventoryItems.eventId, ctx.eventId)));
  const created = u.created as string[];
  if (created.length)
    await ctx.db
      .delete(t.inventoryItems)
      .where(and(inArray(t.inventoryItems.id, created), eq(t.inventoryItems.eventId, ctx.eventId)));
}

function countDiff(rows: Counted[], after: number[]) {
  return rows.map((r, i) => ({
    entity: "inventory_items",
    id: r.id,
    before: r.id ? { name: r.name, count: r.count } : null,
    after: { name: r.name, count: after[i] },
  }));
}

export const updateInventory: Executor<"logistics.inventory.update"> = {
  kind: "logistics.inventory.update",
  async describe(p, ctx) {
    const cur = await findItem(ctx, p.itemId, p.name);
    const before = cur?.count ?? 0;
    return {
      diff: countDiff(
        [{ id: cur?.id ?? null, name: p.name, count: before }],
        [p.count ?? before + (p.delta ?? 0)],
      ),
      impact: impact(),
      preconditions: cur ? [{ entity: "inventory_items", id: cur.id, version: cur.version }] : [],
    };
  },
  async execute(p, ctx) {
    return {
      undoData: await setCounts(ctx, [
        { itemId: p.itemId, name: p.name, unit: p.unit, next: (c) => p.count ?? c + (p.delta ?? 0) },
      ]),
    };
  },
  async inverse(_p, u, ctx) {
    await restoreCounts(ctx, u);
  },
};

const DIETS = ["veg", "nonVeg", "vegan", "jain", "other"] as const;
const DIET_LABEL = { veg: "veg", nonVeg: "non-veg", vegan: "vegan", jain: "jain", other: "other" } as const;

// There is no meal table, so food counts are inventory items named per day, meal and diet
// ("lunch 2026-10-24 veg", unit "meals"): the caterer order is a count of things, and it gets
// the same undo and history as any other stock.
const mealName = (date: string, meal: string, d: (typeof DIETS)[number]) =>
  `${meal} ${date} ${DIET_LABEL[d]}`;

export const setFoodCount: Executor<"logistics.food_count.set"> = {
  kind: "logistics.food_count.set",
  async describe(p, ctx) {
    const names = DIETS.map((d) => mealName(p.date, p.meal, d));
    const existing = await ctx.db
      .select()
      .from(t.inventoryItems)
      .where(and(eq(t.inventoryItems.eventId, ctx.eventId), inArray(t.inventoryItems.name, names)));
    const rows = names.map((name) => {
      const cur = existing.find((x) => x.name === name);
      return { id: cur?.id ?? null, name, count: cur?.count ?? 0 };
    });
    return {
      diff: countDiff(
        rows,
        DIETS.map((d) => p.counts[d]),
      ),
      impact: impact(),
      preconditions: existing.map((x) => ({ entity: "inventory_items", id: x.id, version: x.version })),
    };
  },
  async execute(p, ctx) {
    return {
      undoData: await setCounts(
        ctx,
        DIETS.map((d) => ({ name: mealName(p.date, p.meal, d), unit: "meals", next: () => p.counts[d] })),
      ),
    };
  },
  async inverse(_p, u, ctx) {
    await restoreCounts(ctx, u);
  },
};
