import type { PgTable } from "drizzle-orm/pg-core";
import { fixtures, type EventWorld } from "@/contracts/fixtures";
import type { Db } from "@/db/client";
import * as t from "@/db/schema";
import { logger } from "@/lib/logger";
import { signTicket } from "@/server/checkin/ticket";
import { emailHash, encrypt, phoneHash } from "@/server/pii";
import { kbContent } from "./kb";

const log = logger.child({ module: "db.seed" });

const d = (iso: string) => new Date(iso);
const dOpt = (iso: string | undefined) => (iso ? new Date(iso) : null);

/** Insert in chunks so large tables stay under the Postgres parameter limit. */
async function insertAll<T extends PgTable>(db: Db, table: T, rows: T["$inferInsert"][], size = 400) {
  for (let i = 0; i < rows.length; i += size) {
    await db.insert(table).values(rows.slice(i, i + size));
  }
}

/** The consent purposes shown on the registration form (blueprint Section 6, rows 12 and 13). */
export const CONSENT_PURPOSES = [
  "registration",
  "event_communication",
  "check_in",
  "certificates",
  "attendance_letters",
];

async function seedWorld(db: Db, w: EventWorld, opts: { insertOrg: boolean }) {
  const e = w.event;

  if (opts.insertOrg) await db.insert(t.orgs).values(w.org);
  await insertAll(
    db,
    t.users,
    w.users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      emailVerified: true,
      createdAt: d(u.createdAt),
    })),
  );
  await db.insert(t.events).values({
    id: e.id,
    orgId: e.orgId,
    slug: e.slug,
    name: e.name,
    type: e.type,
    tagline: e.tagline ?? null,
    description: e.description,
    startsAt: d(e.startsAt),
    endsAt: d(e.endsAt),
    timezone: e.timezone,
    venue: e.venue,
    capacity: e.capacity,
    status: e.status,
    settings: e.settings,
    brief: e.brief ?? null,
    version: e.version,
    createdAt: d(e.createdAt),
  });
  await insertAll(db, t.memberships, w.memberships);
  await insertAll(
    db,
    t.agentConfigs,
    w.agents.map((a) => ({
      eventId: e.id,
      agent: a.name,
      enabled: a.enabled,
      autoApproveT1: a.autoApproveT1,
      humanLeadRole: a.humanLeadRole,
      humanLeadUserId: a.humanLeadUserId ?? null,
      mandate: a.mandate ?? null,
      modelTier: a.modelTier,
    })),
  );

  // ------------------------------------------------------------ program
  await insertAll(db, t.rooms, w.rooms);
  await insertAll(db, t.tracks, w.tracks);
  await insertAll(
    db,
    t.speakers,
    w.speakers.map((s) => ({
      id: s.id,
      eventId: s.eventId,
      name: s.name,
      title: s.title ?? null,
      organization: s.organization ?? null,
      bio: s.bio ?? null,
      emailEnc: s.email ? encrypt(s.email) : null,
      phoneEnc: s.phone ? encrypt(s.phone) : null,
      status: s.status,
      version: s.version,
    })),
  );
  await insertAll(
    db,
    t.sessions,
    w.sessions.map((s) => ({
      id: s.id,
      eventId: s.eventId,
      trackId: s.trackId ?? null,
      roomId: s.roomId,
      title: s.title,
      description: s.description ?? null,
      kind: s.kind,
      startsAt: d(s.startsAt),
      endsAt: d(s.endsAt),
      capacity: s.capacity,
      status: s.status,
      delayMinutes: s.delayMinutes,
      version: s.version,
    })),
  );
  await insertAll(
    db,
    t.sessionSpeakers,
    w.sessions.flatMap((s) =>
      s.speakerIds.map((speakerId) => ({
        sessionId: s.id,
        speakerId,
        role: s.kind === "judging" ? ("judge" as const) : ("speaker" as const),
      })),
    ),
  );
  await insertAll(
    db,
    t.speakerRequirements,
    w.speakers
      .filter((s) => s.requirementsSubmitted)
      .map((s) => ({
        speakerId: s.id,
        eventId: s.eventId,
        av: ["projector", "hdmi", "lapel_mic"],
        submittedAt: d(e.createdAt),
        bioConfirmed: true,
      })),
  );

  // ------------------------------------------------------------ registrations
  await insertAll(
    db,
    t.teams,
    w.teams.map(({ memberIds: _m, ...team }) => team),
  );
  await insertAll(
    db,
    t.registrations,
    w.registrations.map((r) => ({
      id: r.id,
      eventId: r.eventId,
      userId: r.userId ?? null,
      name: r.name,
      emailEnc: encrypt(r.email),
      emailHash: emailHash(r.email),
      phoneEnc: r.phone ? encrypt(r.phone) : null,
      phoneHash: r.phone ? phoneHash(r.phone) : null,
      college: r.college,
      department: r.department,
      year: r.year,
      section: r.section,
      rollNo: r.rollNo ?? null,
      status: r.status,
      waitlistPosition: r.waitlistPosition ?? null,
      teamId: r.teamId ?? null,
      foodPref: r.foodPref,
      accessibility: r.accessibility ?? null,
      adultConfirmed: r.adultConfirmed,
      guardianConsent: r.guardianConsent,
      consentVersion: r.consentVersion,
      duplicateOfId: r.duplicateOfId ?? null,
      checkedInAt: dOpt(r.checkedInAt),
      version: r.version,
      createdAt: d(r.createdAt),
    })),
  );
  await insertAll(
    db,
    t.consents,
    w.registrations.map((r) => ({
      eventId: r.eventId,
      registrationId: r.id,
      userId: r.userId ?? null,
      consentVersion: r.consentVersion,
      purposes: CONSENT_PURPOSES,
      adultConfirmed: r.adultConfirmed,
      guardianConsent: r.guardianConsent,
      givenAt: d(r.createdAt),
    })),
  );
  await insertAll(
    db,
    t.sessionChoices,
    w.registrations.flatMap((r) =>
      r.sessionChoices.map((sessionId) => ({
        registrationId: r.id,
        sessionId,
        eventId: r.eventId,
        createdAt: d(r.createdAt),
      })),
    ),
  );
  // Fixture tokens are placeholders; the seed signs real ones with TICKET_SIGNING_PRIVATE_KEY.
  await insertAll(
    db,
    t.tickets,
    w.tickets.map((tk) => ({
      id: tk.id,
      eventId: tk.eventId,
      registrationId: tk.registrationId,
      token: signTicket({
        ticketId: tk.id,
        registrationId: tk.registrationId,
        eventId: tk.eventId,
        exp: Math.floor(new Date(tk.expiresAt).getTime() / 1000),
      }),
      issuedAt: d(tk.issuedAt),
      expiresAt: d(tk.expiresAt),
      revoked: tk.revoked,
    })),
  );
  await insertAll(
    db,
    t.checkins,
    w.checkins.map((c) => ({
      id: c.id,
      eventId: c.eventId,
      ticketId: c.ticketId,
      registrationId: c.registrationId,
      sessionId: c.sessionId ?? null,
      scannerUserId: c.scannerUserId,
      clientId: c.clientId,
      deviceTime: d(c.deviceTime),
      serverTime: d(c.serverTime),
      duplicate: c.duplicate,
      originalCheckinId: c.originalCheckinId ?? null,
    })),
  );

  // ------------------------------------------------------------ crew
  await insertAll(
    db,
    t.volunteers,
    w.volunteers.map((v) => ({
      id: v.id,
      eventId: v.eventId,
      userId: v.userId ?? null,
      name: v.name,
      skills: v.skills,
      maxHours: v.maxHours,
      active: v.active,
      version: v.version,
    })),
  );
  await insertAll(
    db,
    t.availability,
    w.availability.map((a) => ({ ...a, start: d(a.start), end: d(a.end) })),
  );
  await insertAll(
    db,
    t.shifts,
    w.shifts.map((s) => ({
      id: s.id,
      eventId: s.eventId,
      role: s.role,
      roomId: s.roomId ?? null,
      sessionId: s.sessionId ?? null,
      startsAt: d(s.startsAt),
      endsAt: d(s.endsAt),
      requiredCount: s.requiredCount,
      skills: s.skills,
      version: s.version,
    })),
  );
  await insertAll(
    db,
    t.shiftAssignments,
    w.shiftAssignments.map((a) => ({
      id: a.id,
      eventId: e.id,
      shiftId: a.shiftId,
      volunteerId: a.volunteerId,
      status: a.status,
      checkedInAt: dOpt(a.checkedInAt),
      version: a.version,
    })),
  );
  await insertAll(
    db,
    t.tasks,
    w.tasks.map((x) => ({
      id: x.id,
      eventId: x.eventId,
      title: x.title,
      description: x.description ?? null,
      assigneeVolunteerId: x.assigneeVolunteerId ?? null,
      roomId: x.roomId ?? null,
      incidentId: x.incidentId ?? null,
      status: x.status,
      priority: x.priority,
      dueAt: dOpt(x.dueAt),
      version: x.version,
      createdAt: d(x.createdAt),
    })),
  );
  await insertAll(
    db,
    t.incidents,
    w.incidents.map((x) => ({
      id: x.id,
      eventId: x.eventId,
      title: x.title,
      category: x.category,
      severity: x.severity,
      status: x.status,
      source: x.source,
      description: x.description,
      roomId: x.roomId ?? null,
      emergency: x.emergency,
      reportedByUserId: x.reportedByUserId ?? null,
      resolvedAt: dOpt(x.resolvedAt),
      version: x.version,
      createdAt: d(x.createdAt),
    })),
  );

  // ------------------------------------------------------------ knowledge and comms
  // Documents start as "processing"; the KB ingestion job chunks and embeds them.
  await insertAll(
    db,
    t.kbDocuments,
    w.kbDocuments.map((k) => ({
      id: k.id,
      eventId: k.eventId,
      title: k.title,
      kind: k.kind,
      mimeType: k.mimeType,
      content: kbContent(k.id),
      version: k.version,
      status: "processing" as const,
      public: k.public,
      chunkCount: 0,
      updatedAt: d(k.updatedAt),
    })),
  );
  await insertAll(
    db,
    t.conversations,
    w.conversations.map((c) => ({
      id: c.id,
      eventId: c.eventId,
      channel: c.channel,
      userId: c.userId ?? null,
      askerRole: c.askerRole,
      status: c.status,
      createdAt: d(c.createdAt),
    })),
  );
  await insertAll(
    db,
    t.messages,
    w.messages.map((m) => ({
      id: m.id,
      eventId: e.id,
      conversationId: m.conversationId,
      role: m.role,
      body: m.body,
      citations: m.citations,
      guard: m.guard ?? null,
      escalationId: m.escalationId ?? null,
      clusterKey: m.role === "user" && /lunch/i.test(m.body) ? "lunch_location" : null,
      at: d(m.at),
    })),
  );
  await insertAll(
    db,
    t.escalations,
    w.escalations.map((x) => ({
      id: x.id,
      eventId: x.eventId,
      conversationId: x.conversationId,
      summary: x.summary,
      suggestedReply: x.suggestedReply ?? null,
      priority: x.priority,
      status: x.status,
      createdAt: d(x.createdAt),
    })),
  );
  await insertAll(
    db,
    t.announcements,
    w.announcements.map((a) => ({
      id: a.id,
      eventId: a.eventId,
      title: a.title,
      body: a.body,
      bodyByChannel: a.bodyByChannel,
      segment: a.segment,
      channels: a.channels,
      category: a.category,
      public: a.public,
      status: a.status,
      scheduledFor: dOpt(a.scheduledFor),
      sentAt: dOpt(a.sentAt),
      recipientCount: a.recipientCount,
      approvedByRole: a.approvedByRole ?? null,
      draftedBy: a.draftedBy ?? null,
      proposalId: a.proposalId ?? null,
    })),
  );

  // ------------------------------------------------------------ planning, money, growth
  await insertAll(
    db,
    t.milestones,
    w.milestones.map((m) => ({ ...m, completedAt: dOpt(m.completedAt) })),
  );
  await insertAll(db, t.budgetCategories, w.budgetCategories);
  await insertAll(
    db,
    t.ledgerEntries,
    w.ledgerEntries.map((l) => ({
      id: l.id,
      eventId: l.eventId,
      type: l.type,
      categoryId: l.categoryId ?? null,
      amountInr: l.amountInr,
      status: l.status,
      vendor: l.vendor ?? null,
      source: l.source ?? null,
      sponsorId: l.sponsorId ?? null,
      note: l.note,
      evidenceRef: l.evidenceRef ?? null,
      occurredOn: l.occurredOn,
      proposalId: l.proposalId ?? null,
      createdAt: d(l.createdAt),
    })),
  );
  await insertAll(
    db,
    t.quotes,
    w.quotes.map((q) => ({
      ...q,
      categoryId: q.categoryId ?? null,
      recommendedVendor: q.recommendedVendor ?? null,
      createdAt: d(q.createdAt),
    })),
  );
  await insertAll(
    db,
    t.sponsorProspects,
    w.sponsorProspects.map(({ deliverables: _d, ...s }) => ({
      ...s,
      tier: s.tier ?? null,
      contactName: s.contactName ?? null,
      askInr: s.askInr ?? null,
      committedInr: s.committedInr ?? null,
      lastTouchAt: dOpt(s.lastTouchAt),
      nextFollowUpAt: dOpt(s.nextFollowUpAt),
    })),
  );
  await insertAll(
    db,
    t.sponsorDeliverables,
    w.sponsorProspects.flatMap((s) =>
      s.deliverables.map((x) => ({
        id: x.id,
        eventId: s.eventId,
        prospectId: s.id,
        title: x.title,
        status: x.status,
        dueOn: x.dueOn ?? null,
      })),
    ),
  );
  await insertAll(
    db,
    t.marketingPosts,
    w.marketingPosts.map((p) => ({ ...p, scheduledFor: dOpt(p.scheduledFor), postedAt: dOpt(p.postedAt) })),
  );
  await insertAll(
    db,
    t.funnelSnapshots,
    w.funnel.map((f) => ({ ...f, eventId: e.id })),
  );
  await insertAll(
    db,
    t.checklists,
    w.checklists.map((c) => ({
      id: c.id,
      eventId: c.eventId,
      title: c.title,
      scopeType: c.scope.type,
      scopeRef: c.scope.ref ?? null,
      version: c.version,
    })),
  );
  await insertAll(
    db,
    t.checklistItems,
    w.checklists.flatMap((c) =>
      c.items.map((it, i) => ({
        id: it.id,
        eventId: c.eventId,
        checklistId: c.id,
        ordinal: i,
        label: it.label,
        status: it.status,
        notes: it.notes ?? null,
      })),
    ),
  );
  await insertAll(
    db,
    t.inventoryItems,
    w.inventory.map((it) => ({ ...it, unit: it.unit ?? null })),
  );

  // ------------------------------------------------------------ proposals and traces
  await insertAll(
    db,
    t.proposals,
    w.proposals.map((p) => ({
      id: p.id,
      eventId: p.eventId,
      kind: p.kind,
      payload: p.payload,
      proposedBy: p.proposedBy,
      proposerAgent: p.proposedBy.kind === "agent" ? p.proposedBy.agent : null,
      planId: p.planId ?? null,
      parentId: p.parentId ?? null,
      domain: p.domain,
      summary: p.summary,
      rationale: p.rationale,
      evidence: p.evidence,
      impact: p.impact,
      diff: p.diff,
      diffHash: p.diffHash,
      riskTier: p.riskTier,
      tierReasons: p.tierReasons,
      requiredApprovals: p.requiredApprovals,
      facultyApprovalRequired: p.facultyApprovalRequired,
      status: p.status,
      idempotencyKey: p.idempotencyKey,
      preconditions: p.preconditions,
      expiresAt: d(p.expiresAt),
      executedAt: dOpt(p.executedAt),
      undoUntil: dOpt(p.undoUntil),
      error: p.error ?? null,
      createdAt: d(p.createdAt),
    })),
  );
  await insertAll(
    db,
    t.proposalApprovals,
    w.proposals.flatMap((p) =>
      p.approvals.map((a) => ({
        eventId: p.eventId,
        proposalId: p.id,
        userId: a.userId,
        role: a.role,
        diffHash: a.diffHash,
        at: d(a.at),
      })),
    ),
  );
  await insertAll(
    db,
    t.agentRuns,
    w.agentRuns.map((r) => ({
      id: r.id,
      eventId: r.eventId,
      agent: r.agent,
      trigger: r.trigger,
      status: r.status,
      simulation: r.simulation,
      modelTier: r.modelTier,
      startedAt: d(r.startedAt),
      finishedAt: dOpt(r.finishedAt),
      stepCount: r.stepCount,
      proposalIds: r.proposalIds,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      costUsd: r.costUsd,
      latencyMs: r.latencyMs ?? null,
      error: r.error ?? null,
    })),
  );
  await insertAll(
    db,
    t.agentSteps,
    w.agentSteps.map(({ id, runId, index, at, kind, ...data }) => ({
      id,
      eventId: e.id,
      runId,
      index,
      kind,
      data: data as Record<string, unknown>,
      costUsd: kind === "llm" && "costUsd" in data ? (data.costUsd as number) : null,
      at: d(at),
    })),
  );
  await insertAll(
    db,
    t.domainEvents,
    [...w.domainEvents].reverse().map((x) => ({ ...x, at: d(x.at) })),
  );
  await insertAll(
    db,
    t.briefings,
    w.briefings.map((b) => ({ ...b, generatedAt: d(b.generatedAt) })),
  );
  await insertAll(
    db,
    t.whatifRuns,
    w.whatIfRuns.map((r) => ({
      id: r.id,
      eventId: r.eventId,
      scenario: r.scenario,
      result: r,
      createdAt: d(r.createdAt),
    })),
  );
  await insertAll(
    db,
    t.playbookLessons,
    w.playbookLessons.map((l) => ({
      id: l.id,
      orgId: w.org.id,
      eventType: l.eventType,
      title: l.title,
      lesson: l.lesson,
      tags: l.tags,
      sourceEventId: l.sourceEventId ?? null,
      createdAt: d(l.createdAt),
    })),
  );
}

/**
 * Seeds the demo world (blueprint Section 11): HackNova 2026 and the charity drive,
 * exactly as in `fixtures.worlds()`, so fixture ids match the database.
 * Runs in one transaction. Expects empty tables (use demo:reset to wipe first).
 */
export async function seed(db: Db): Promise<{ events: string[]; ms: number }> {
  const started = Date.now();
  const worlds = fixtures.worlds();
  await db.transaction(async (tx) => {
    for (const [i, w] of worlds.entries()) {
      await seedWorld(tx as unknown as Db, w, { insertOrg: i === 0 });
    }
  });
  const ms = Date.now() - started;
  log.info({ events: worlds.map((w) => w.event.slug), ms }, "seeded");
  return { events: worlds.map((w) => w.event.slug), ms };
}
