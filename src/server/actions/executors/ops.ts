import { and, eq, sql } from "drizzle-orm";
import { DomainEventPayloads, isEmergencyCategory } from "@/contracts";
import * as t from "@/db/schema";
import { bumpVersion } from "@/db/versioning";
import { ExecutionError, impact, type Executor } from "../types";
import { mustLoad } from "./_util";

// ---------------------------------------------------------------- incidents

export const createIncident: Executor<"incident.create"> = {
  kind: "incident.create",
  async describe(p) {
    return {
      diff: [
        {
          entity: "incidents",
          id: null,
          before: null,
          after: { title: p.title, category: p.category, severity: p.severity },
        },
      ],
      impact: impact(),
      preconditions: [],
    };
  },
  async execute(p, ctx) {
    if (p.roomId) await mustLoad(ctx.db, t.rooms, p.roomId, ctx.eventId, "Room");
    const emergency = isEmergencyCategory(p.category);
    const [row] = await ctx.db
      .insert(t.incidents)
      .values({
        eventId: ctx.eventId,
        title: p.title,
        category: p.category,
        severity: p.severity,
        source: p.source,
        description: p.description,
        roomId: p.roomId ?? null,
        emergency,
        evidenceRefs: p.evidenceRefs,
      })
      .returning({ id: t.incidents.id });
    ctx.emit({
      type: "incident.created",
      entity: "incidents",
      entityId: row!.id,
      payload: DomainEventPayloads["incident.created"].parse({
        incidentId: row!.id,
        category: p.category,
        severity: p.severity,
        emergency,
      }),
    });
    if (emergency) {
      ctx.emit({
        type: "system.emergency_alert",
        entity: "incidents",
        entityId: row!.id,
        payload: DomainEventPayloads["system.emergency_alert"].parse({
          incidentId: row!.id,
          summary: p.title,
        }),
      });
    }
    return { undoData: { incidentId: row!.id } };
  },
};

export const updateIncident: Executor<"incident.update"> = {
  kind: "incident.update",
  async describe(p, ctx) {
    const i = await mustLoad(ctx.db, t.incidents, p.incidentId, ctx.eventId, "Incident");
    const after: Record<string, unknown> = {};
    if (p.status) after.status = p.status;
    if (p.severity) after.severity = p.severity;
    if (p.assigneeUserId) after.assigneeUserId = p.assigneeUserId;
    return {
      diff: [
        {
          entity: "incidents",
          id: i.id,
          before: { status: i.status, severity: i.severity, assigneeUserId: i.assigneeUserId },
          after,
        },
      ],
      impact: impact(),
      preconditions: [{ entity: "incidents", id: i.id, version: i.version }],
    };
  },
  async execute(p, ctx) {
    const i = await mustLoad(ctx.db, t.incidents, p.incidentId, ctx.eventId, "Incident");
    await ctx.db
      .update(t.incidents)
      .set({
        status: p.status ?? i.status,
        severity: p.severity ?? i.severity,
        assigneeUserId: p.assigneeUserId ?? i.assigneeUserId,
        description: p.note ? `${i.description}\n\n${p.note}`.trim() : i.description,
        resolvedAt: p.status === "resolved" ? ctx.now : i.resolvedAt,
        version: bumpVersion(t.incidents),
      })
      .where(eq(t.incidents.id, i.id));
    ctx.emit({
      type: p.status === "resolved" ? "incident.resolved" : "incident.updated",
      entity: "incidents",
      entityId: i.id,
      payload: { incidentId: i.id, status: p.status ?? i.status },
    });
    return {
      undoData: {
        status: i.status,
        severity: i.severity,
        assigneeUserId: i.assigneeUserId,
        description: i.description,
        resolvedAt: i.resolvedAt?.toISOString() ?? null,
      },
    };
  },
  async inverse(p, u, ctx) {
    await ctx.db
      .update(t.incidents)
      .set({
        status: u.status as string,
        severity: u.severity as string,
        assigneeUserId: (u.assigneeUserId as string | null) ?? null,
        description: u.description as string,
        resolvedAt: u.resolvedAt ? new Date(u.resolvedAt as string) : null,
        version: bumpVersion(t.incidents),
      })
      .where(and(eq(t.incidents.id, p.incidentId), eq(t.incidents.eventId, ctx.eventId)));
  },
};

// ---------------------------------------------------------------- helpdesk and KB

export const escalate: Executor<"helpdesk.escalate"> = {
  kind: "helpdesk.escalate",
  async describe(p, ctx) {
    await mustLoad(ctx.db, t.conversations, p.conversationId, ctx.eventId, "Conversation");
    return {
      diff: [
        {
          entity: "escalations",
          id: null,
          before: null,
          after: { conversationId: p.conversationId, priority: p.priority },
        },
      ],
      impact: impact(),
      preconditions: [],
    };
  },
  async execute(p, ctx) {
    await mustLoad(ctx.db, t.conversations, p.conversationId, ctx.eventId, "Conversation");
    const [row] = await ctx.db
      .insert(t.escalations)
      .values({
        eventId: ctx.eventId,
        conversationId: p.conversationId,
        summary: p.summary,
        suggestedReply: p.suggestedReply ?? null,
        priority: p.priority,
      })
      .returning({ id: t.escalations.id });
    await ctx.db
      .update(t.conversations)
      .set({ status: "escalated" })
      .where(eq(t.conversations.id, p.conversationId));
    if (p.messageId) {
      await ctx.db
        .update(t.messages)
        .set({ escalationId: row!.id })
        .where(and(eq(t.messages.id, p.messageId), eq(t.messages.eventId, ctx.eventId)));
    }
    ctx.emit({
      type: "helpdesk.escalated",
      entity: "escalations",
      entityId: row!.id,
      payload: { escalationId: row!.id, conversationId: p.conversationId, priority: p.priority },
    });
    return { undoData: { escalationId: row!.id } };
  },
};

export const reply: Executor<"helpdesk.reply"> = {
  kind: "helpdesk.reply",
  async describe(p, ctx) {
    const c = await mustLoad(ctx.db, t.conversations, p.conversationId, ctx.eventId, "Conversation");
    return {
      diff: [{ entity: "messages", id: null, before: null, after: { conversationId: c.id, role: "staff" } }],
      impact: impact({
        people: 1,
        attendees: c.askerRole === "attendee" ? 1 : 0,
        volunteers: c.askerRole === "volunteer" ? 1 : 0,
        channels: [c.channel],
        reversible: false,
      }),
      preconditions: [],
    };
  },
  async execute(p, ctx) {
    const c = await mustLoad(ctx.db, t.conversations, p.conversationId, ctx.eventId, "Conversation");
    const [msg] = await ctx.db
      .insert(t.messages)
      .values({
        eventId: ctx.eventId,
        conversationId: c.id,
        role: "staff",
        body: p.body,
        citations: p.citations,
        escalationId: p.escalationId ?? null,
      })
      .returning({ id: t.messages.id });
    if (p.escalationId) {
      await ctx.db
        .update(t.escalations)
        .set({ status: "answered", version: bumpVersion(t.escalations) })
        .where(and(eq(t.escalations.id, p.escalationId), eq(t.escalations.eventId, ctx.eventId)));
    }
    if (c.userId) {
      await ctx.db.insert(t.notifications).values({
        eventId: ctx.eventId,
        userId: c.userId,
        title: "Reply from the helpdesk",
        body: p.body,
        category: "info",
      });
    }
    ctx.emit({
      type: "helpdesk.replied",
      entity: "messages",
      entityId: msg!.id,
      payload: { conversationId: c.id, messageId: msg!.id, channel: c.channel },
    });
    return { undoData: { messageId: msg!.id } };
  },
};

export const publishKbUpdate: Executor<"kb.publish_update"> = {
  kind: "kb.publish_update",
  async describe(p, ctx) {
    if (p.documentId) {
      const d = await mustLoad(ctx.db, t.kbDocuments, p.documentId, ctx.eventId, "Document");
      return {
        diff: [
          {
            entity: "kb_documents",
            id: d.id,
            before: { title: d.title, version: d.version },
            after: { title: p.title, version: d.version + 1 },
          },
        ],
        impact: impact({ channels: ["in_app"] }),
        preconditions: [{ entity: "kb_documents", id: d.id, version: d.version }],
      };
    }
    return {
      diff: [{ entity: "kb_documents", id: null, before: null, after: { title: p.title, kind: p.kind } }],
      impact: impact({ channels: ["in_app"] }),
      preconditions: [],
    };
  },
  async execute(p, ctx) {
    if (p.documentId) {
      const d = await mustLoad(ctx.db, t.kbDocuments, p.documentId, ctx.eventId, "Document");
      await ctx.db
        .update(t.kbDocuments)
        .set({
          title: p.title,
          content: p.bodyMarkdown,
          public: p.public,
          status: "processing",
          version: bumpVersion(t.kbDocuments),
        })
        .where(eq(t.kbDocuments.id, d.id));
      ctx.emit({
        type: "kb.updated",
        entity: "kb_documents",
        entityId: d.id,
        payload: DomainEventPayloads["kb.updated"].parse({ documentId: d.id, version: d.version + 1 }),
      });
      return { undoData: { documentId: d.id, title: d.title, content: d.content, public: d.public } };
    }
    const [row] = await ctx.db
      .insert(t.kbDocuments)
      .values({
        eventId: ctx.eventId,
        title: p.title,
        kind: p.kind,
        mimeType: "text/markdown",
        content: p.bodyMarkdown,
        public: p.public,
      })
      .returning({ id: t.kbDocuments.id });
    ctx.emit({
      type: "kb.document_added",
      entity: "kb_documents",
      entityId: row!.id,
      payload: { documentId: row!.id, version: 1 },
    });
    return { undoData: { documentId: row!.id, created: true } };
  },
  async inverse(_p, u, ctx) {
    const id = u.documentId as string;
    if (u.created) {
      await ctx.db
        .delete(t.kbDocuments)
        .where(and(eq(t.kbDocuments.id, id), eq(t.kbDocuments.eventId, ctx.eventId)));
      return;
    }
    const [d] = await ctx.db
      .select()
      .from(t.kbDocuments)
      .where(and(eq(t.kbDocuments.id, id), eq(t.kbDocuments.eventId, ctx.eventId)));
    await ctx.db
      .update(t.kbDocuments)
      .set({
        title: u.title as string,
        content: u.content as string,
        public: u.public as boolean,
        status: "processing",
        version: bumpVersion(t.kbDocuments),
      })
      .where(eq(t.kbDocuments.id, id));
    ctx.emit({
      type: "kb.updated",
      entity: "kb_documents",
      entityId: id,
      payload: { documentId: id, version: (d?.version ?? 1) + 1 },
    });
  },
};

// ---------------------------------------------------------------- finance

async function categoryUse(db: Parameters<typeof mustLoad>[0], categoryId: string): Promise<number> {
  const [r] = await db
    .select({
      used: sql<number>`coalesce(sum(case when ${t.ledgerEntries.type} = 'expense' then ${t.ledgerEntries.amountInr} when ${t.ledgerEntries.type} = 'refund' then -${t.ledgerEntries.amountInr} else 0 end), 0)::float`,
    })
    .from(t.ledgerEntries)
    .where(eq(t.ledgerEntries.categoryId, categoryId));
  return r?.used ?? 0;
}

export const recordExpense: Executor<"finance.expense.record"> = {
  kind: "finance.expense.record",
  async describe(p, ctx) {
    const c = await mustLoad(ctx.db, t.budgetCategories, p.categoryId, ctx.eventId, "Budget category");
    const used = await categoryUse(ctx.db, c.id);
    return {
      diff: [
        {
          entity: "ledger_entries",
          id: null,
          before: null,
          after: { type: "expense", categoryId: c.id, amountInr: p.amountInr, status: p.status },
        },
        {
          entity: "budget_categories",
          id: c.id,
          before: { usedInr: used, usedRatio: c.capInr ? used / c.capInr : 0 },
          after: { usedInr: used + p.amountInr, usedRatio: c.capInr ? (used + p.amountInr) / c.capInr : 0 },
        },
      ],
      impact: impact({ moneyInr: p.amountInr }),
      preconditions: [{ entity: "budget_categories", id: c.id, version: c.version }],
    };
  },
  async execute(p, ctx) {
    const c = await mustLoad(ctx.db, t.budgetCategories, p.categoryId, ctx.eventId, "Budget category");
    const before = await categoryUse(ctx.db, c.id);
    const [row] = await ctx.db
      .insert(t.ledgerEntries)
      .values({
        eventId: ctx.eventId,
        type: "expense",
        categoryId: c.id,
        amountInr: p.amountInr,
        status: p.status,
        vendor: p.vendor ?? null,
        note: p.note,
        evidenceRef: p.evidenceRef ?? null,
        occurredOn: p.occurredOn ?? ctx.now.toISOString().slice(0, 10),
        proposalId: ctx.proposalId,
      })
      .returning({ id: t.ledgerEntries.id });
    ctx.emit({
      type: "finance.expense_recorded",
      entity: "ledger_entries",
      entityId: row!.id,
      payload: { categoryId: c.id, amountInr: p.amountInr, status: p.status },
    });
    const ratioBefore = c.capInr ? before / c.capInr : 0;
    const ratioAfter = c.capInr ? (before + p.amountInr) / c.capInr : 0;
    for (const [mark, label] of [
      [0.8, "80"],
      [1, "100"],
    ] as const) {
      if (ratioBefore < mark && ratioAfter >= mark) {
        ctx.emit({
          type: "finance.threshold_crossed",
          entity: "budget_categories",
          entityId: c.id,
          payload: DomainEventPayloads["finance.threshold_crossed"].parse({
            categoryId: c.id,
            threshold: label,
            spentRatio: Math.round(ratioAfter * 10_000) / 10_000,
          }),
        });
      }
    }
    return { undoData: { entryId: row!.id } };
  },
  async inverse(_p, u, ctx) {
    await ctx.db
      .delete(t.ledgerEntries)
      .where(and(eq(t.ledgerEntries.id, u.entryId as string), eq(t.ledgerEntries.eventId, ctx.eventId)));
  },
};

export const recordIncome: Executor<"finance.income.record"> = {
  kind: "finance.income.record",
  async describe(p) {
    return {
      diff: [
        {
          entity: "ledger_entries",
          id: null,
          before: null,
          after: { type: "income", source: p.source, amountInr: p.amountInr, status: p.status },
        },
      ],
      impact: impact({ moneyInr: p.amountInr }),
      preconditions: [],
    };
  },
  async execute(p, ctx) {
    if (p.sponsorId) await mustLoad(ctx.db, t.sponsorProspects, p.sponsorId, ctx.eventId, "Sponsor");
    const [row] = await ctx.db
      .insert(t.ledgerEntries)
      .values({
        eventId: ctx.eventId,
        type: "income",
        amountInr: p.amountInr,
        status: p.status,
        source: p.source,
        sponsorId: p.sponsorId ?? null,
        note: p.note,
        evidenceRef: p.evidenceRef ?? null,
        occurredOn: p.occurredOn ?? ctx.now.toISOString().slice(0, 10),
        proposalId: ctx.proposalId,
      })
      .returning({ id: t.ledgerEntries.id });
    ctx.emit({
      type: "finance.income_recorded",
      entity: "ledger_entries",
      entityId: row!.id,
      payload: { source: p.source, amountInr: p.amountInr, status: p.status },
    });
    return { undoData: { entryId: row!.id } };
  },
  async inverse(_p, u, ctx) {
    await ctx.db
      .delete(t.ledgerEntries)
      .where(and(eq(t.ledgerEntries.id, u.entryId as string), eq(t.ledgerEntries.eventId, ctx.eventId)));
  },
};

export const setBudget: Executor<"finance.budget.set"> = {
  kind: "finance.budget.set",
  async describe(p, ctx) {
    const existing = await ctx.db
      .select()
      .from(t.budgetCategories)
      .where(eq(t.budgetCategories.eventId, ctx.eventId));
    const byKey = new Map(existing.map((c) => [c.key, c]));
    return {
      diff: p.categories.map((c) => {
        const cur = c.categoryId ? existing.find((x) => x.id === c.categoryId) : byKey.get(c.key);
        return {
          entity: "budget_categories",
          id: cur?.id ?? null,
          before: cur ? { name: cur.name, capInr: cur.capInr } : null,
          after: { key: c.key, name: c.name, capInr: c.capInr },
        };
      }),
      impact: impact({ moneyInr: p.totalInr }),
      preconditions: existing
        .filter((c) => p.categories.some((x) => x.categoryId === c.id || x.key === c.key))
        .map((c) => ({ entity: "budget_categories", id: c.id, version: c.version })),
    };
  },
  async execute(p, ctx) {
    const sum = p.categories.reduce((s, c) => s + c.capInr, 0);
    if (sum > p.totalInr + 0.01)
      throw new ExecutionError(`Category caps add up to ${sum}, more than the total of ${p.totalInr}`);
    const existing = await ctx.db
      .select()
      .from(t.budgetCategories)
      .where(eq(t.budgetCategories.eventId, ctx.eventId));
    const previous: { id: string; name: string; capInr: number }[] = [];
    const created: string[] = [];
    for (const c of p.categories) {
      const cur = c.categoryId
        ? existing.find((x) => x.id === c.categoryId)
        : existing.find((x) => x.key === c.key);
      if (cur) {
        previous.push({ id: cur.id, name: cur.name, capInr: cur.capInr });
        await ctx.db
          .update(t.budgetCategories)
          .set({ name: c.name, capInr: c.capInr, version: bumpVersion(t.budgetCategories) })
          .where(eq(t.budgetCategories.id, cur.id));
      } else {
        const [row] = await ctx.db
          .insert(t.budgetCategories)
          .values({ eventId: ctx.eventId, key: c.key, name: c.name, capInr: c.capInr })
          .returning({ id: t.budgetCategories.id });
        created.push(row!.id);
      }
    }
    ctx.emit({
      type: "finance.budget_set",
      entity: "events",
      entityId: ctx.eventId,
      payload: { totalInr: p.totalInr, categories: p.categories.length },
    });
    return { undoData: { previous, created } };
  },
  async inverse(_p, u, ctx) {
    for (const c of u.previous as { id: string; name: string; capInr: number }[]) {
      await ctx.db
        .update(t.budgetCategories)
        .set({ name: c.name, capInr: c.capInr, version: bumpVersion(t.budgetCategories) })
        .where(and(eq(t.budgetCategories.id, c.id), eq(t.budgetCategories.eventId, ctx.eventId)));
    }
    for (const id of u.created as string[]) {
      await ctx.db
        .delete(t.budgetCategories)
        .where(and(eq(t.budgetCategories.id, id), eq(t.budgetCategories.eventId, ctx.eventId)));
    }
  },
};

export const compareQuotes: Executor<"finance.quote.compare"> = {
  kind: "finance.quote.compare",
  async describe(p) {
    return {
      diff: [
        {
          entity: "quotes",
          id: null,
          before: null,
          after: { title: p.title, vendors: p.quotes.map((q) => q.vendor) },
        },
      ],
      impact: impact(),
      preconditions: [],
    };
  },
  async execute(p, ctx) {
    if (p.categoryId)
      await mustLoad(ctx.db, t.budgetCategories, p.categoryId, ctx.eventId, "Budget category");
    const [row] = await ctx.db
      .insert(t.quotes)
      .values({
        eventId: ctx.eventId,
        title: p.title,
        categoryId: p.categoryId ?? null,
        rows: p.quotes,
        recommendedVendor: p.recommendation?.vendor ?? null,
        proposalId: ctx.proposalId,
      })
      .returning({ id: t.quotes.id });
    return { undoData: { quoteId: row!.id } };
  },
  async inverse(_p, u, ctx) {
    await ctx.db
      .delete(t.quotes)
      .where(and(eq(t.quotes.id, u.quoteId as string), eq(t.quotes.eventId, ctx.eventId)));
  },
};
