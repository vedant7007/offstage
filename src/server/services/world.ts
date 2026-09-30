/**
 * Read side for agents (issue #26).
 *
 *   loadWorld(eventId)        the event's current state as an EventWorld, for what-if snapshots
 *   createReadServices(actor) the ReadServices agents read through, bound to the actor's event
 *
 * createReadServices loads the world once per run (a consistent snapshot) and answers through
 * Vedant's worldServices, so the database and the fixtures give agents identical shapes:
 * masked contact details and public speaker fields only.
 */
import { and, asc, desc, eq, gte } from "drizzle-orm";
import type { ReadServices } from "@/agents/runtime/services";
import { worldServices } from "@/agents/runtime/services";
import { AGENT_DOMAIN, type Actor, type AgentConfigSummary, type Registration } from "@/contracts";
import type { EventWorld } from "@/contracts/fixtures";
import { db as defaultDb, type Db } from "@/db/client";
import * as t from "@/db/schema";
import { maskPhone } from "@/lib/format";
import { nowUtc } from "@/lib/time";
import { decrypt, decryptOptional } from "@/server/pii";

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : undefined);

function group<T, K>(rows: T[], key: (r: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
  return m;
}

/** The event's state as an EventWorld. Traces, proposals and domain events are left empty. */
export async function loadWorld(eventId: string, client: Db = defaultDb): Promise<EventWorld> {
  const [ev] = await client.select().from(t.events).where(eq(t.events.id, eventId));
  if (!ev) throw new Error(`Event ${eventId} not found`);
  const [org] = await client.select().from(t.orgs).where(eq(t.orgs.id, ev.orgId));
  const [
    rooms,
    tracks,
    sessions,
    links,
    speakers,
    regs,
    choices,
    teams,
    tickets,
    checkins,
    vols,
    avail,
    shifts,
    assigns,
    tasks,
    incidents,
    kb,
    anns,
    milestones,
    cats,
    ledger,
    quotes,
    sponsors,
    deliverables,
    posts,
    funnel,
    checklists,
    items,
    inventory,
    lessons,
    configs,
    users,
    memberships,
    briefings,
  ] = await Promise.all([
    client.select().from(t.rooms).where(eq(t.rooms.eventId, eventId)),
    client.select().from(t.tracks).where(eq(t.tracks.eventId, eventId)),
    client.select().from(t.sessions).where(eq(t.sessions.eventId, eventId)).orderBy(asc(t.sessions.startsAt)),
    client
      .select({ sessionId: t.sessionSpeakers.sessionId, speakerId: t.sessionSpeakers.speakerId })
      .from(t.sessionSpeakers)
      .innerJoin(t.sessions, eq(t.sessions.id, t.sessionSpeakers.sessionId))
      .where(eq(t.sessions.eventId, eventId)),
    client.select().from(t.speakers).where(eq(t.speakers.eventId, eventId)),
    client
      .select()
      .from(t.registrations)
      .where(eq(t.registrations.eventId, eventId))
      .orderBy(asc(t.registrations.createdAt)),
    client.select().from(t.sessionChoices).where(eq(t.sessionChoices.eventId, eventId)),
    client.select().from(t.teams).where(eq(t.teams.eventId, eventId)),
    client.select().from(t.tickets).where(eq(t.tickets.eventId, eventId)),
    client
      .select({ c: t.checkins, scannerName: t.users.name })
      .from(t.checkins)
      .leftJoin(t.users, eq(t.users.id, t.checkins.scannerUserId))
      .where(eq(t.checkins.eventId, eventId)),
    client.select().from(t.volunteers).where(eq(t.volunteers.eventId, eventId)),
    client.select().from(t.availability).where(eq(t.availability.eventId, eventId)),
    client.select().from(t.shifts).where(eq(t.shifts.eventId, eventId)).orderBy(asc(t.shifts.startsAt)),
    client.select().from(t.shiftAssignments).where(eq(t.shiftAssignments.eventId, eventId)),
    client.select().from(t.tasks).where(eq(t.tasks.eventId, eventId)),
    client.select().from(t.incidents).where(eq(t.incidents.eventId, eventId)),
    client.select().from(t.kbDocuments).where(eq(t.kbDocuments.eventId, eventId)),
    client
      .select()
      .from(t.announcements)
      .where(eq(t.announcements.eventId, eventId))
      .orderBy(desc(t.announcements.createdAt)),
    client
      .select()
      .from(t.milestones)
      .where(eq(t.milestones.eventId, eventId))
      .orderBy(asc(t.milestones.dueOn)),
    client.select().from(t.budgetCategories).where(eq(t.budgetCategories.eventId, eventId)),
    client.select().from(t.ledgerEntries).where(eq(t.ledgerEntries.eventId, eventId)),
    client.select().from(t.quotes).where(eq(t.quotes.eventId, eventId)),
    client.select().from(t.sponsorProspects).where(eq(t.sponsorProspects.eventId, eventId)),
    client.select().from(t.sponsorDeliverables).where(eq(t.sponsorDeliverables.eventId, eventId)),
    client.select().from(t.marketingPosts).where(eq(t.marketingPosts.eventId, eventId)),
    client
      .select()
      .from(t.funnelSnapshots)
      .where(eq(t.funnelSnapshots.eventId, eventId))
      .orderBy(asc(t.funnelSnapshots.date)),
    client.select().from(t.checklists).where(eq(t.checklists.eventId, eventId)),
    client
      .select()
      .from(t.checklistItems)
      .where(eq(t.checklistItems.eventId, eventId))
      .orderBy(asc(t.checklistItems.ordinal)),
    client.select().from(t.inventoryItems).where(eq(t.inventoryItems.eventId, eventId)),
    client
      .select()
      .from(t.playbookLessons)
      .where(and(eq(t.playbookLessons.orgId, ev.orgId), eq(t.playbookLessons.eventType, ev.type))),
    client.select().from(t.agentConfigs).where(eq(t.agentConfigs.eventId, eventId)),
    client
      .select({ id: t.users.id, name: t.users.name, email: t.users.email, createdAt: t.users.createdAt })
      .from(t.users)
      .innerJoin(t.memberships, eq(t.memberships.userId, t.users.id))
      .where(eq(t.memberships.eventId, eventId)),
    client.select().from(t.memberships).where(eq(t.memberships.eventId, eventId)),
    client
      .select()
      .from(t.briefings)
      .where(eq(t.briefings.eventId, eventId))
      .orderBy(desc(t.briefings.date))
      .limit(7),
  ]);

  const speakersBySession = group(links, (l) => l.sessionId);
  const choicesByReg = group(choices, (c) => c.registrationId);
  const confirmedIds = new Set(regs.filter((r) => r.status === "confirmed").map((r) => r.id));
  const chosenCount = new Map<string, number>();
  for (const c of choices)
    if (confirmedIds.has(c.registrationId))
      chosenCount.set(c.sessionId, (chosenCount.get(c.sessionId) ?? 0) + 1);
  const shiftById = new Map(shifts.map((s) => [s.id, s]));
  const now = nowUtc();
  const hoursServed = new Map<string, number>();
  for (const a of assigns) {
    const s = shiftById.get(a.shiftId);
    if (!s || !["checked_in", "done"].includes(a.status)) continue;
    const end = Math.min(s.endsAt.getTime(), now.getTime());
    if (end > s.startsAt.getTime())
      hoursServed.set(
        a.volunteerId,
        (hoursServed.get(a.volunteerId) ?? 0) + (end - s.startsAt.getTime()) / 3_600_000,
      );
  }
  const itemsByChecklist = group(items, (i) => i.checklistId);
  const deliverablesBySponsor = group(deliverables, (d) => d.prospectId);
  const userName = new Map(users.map((u) => [u.id, u.name]));

  const registrations: Registration[] = regs.map((r) => ({
    id: r.id,
    eventId: r.eventId,
    userId: r.userId ?? undefined,
    name: r.name,
    email: r.anonymisedAt ? "removed@anonymised.invalid" : decrypt(r.emailEnc),
    phone: r.anonymisedAt ? undefined : decryptOptional(r.phoneEnc),
    college: r.college,
    department: r.department,
    year: r.year,
    section: r.section,
    rollNo: r.rollNo ?? undefined,
    status: r.status as Registration["status"],
    waitlistPosition: r.waitlistPosition ?? undefined,
    sessionChoices: (choicesByReg.get(r.id) ?? []).map((c) => c.sessionId),
    teamId: r.teamId ?? undefined,
    foodPref: r.foodPref as Registration["foodPref"],
    accessibility: r.accessibility ?? undefined,
    adultConfirmed: r.adultConfirmed,
    guardianConsent: r.guardianConsent,
    consentVersion: r.consentVersion,
    duplicateOfId: r.duplicateOfId ?? undefined,
    checkedInAt: iso(r.checkedInAt),
    createdAt: r.createdAt.toISOString(),
    version: r.version,
  }));

  const agents: AgentConfigSummary[] = configs.map((c) => ({
    name: c.agent as AgentConfigSummary["name"],
    domain: AGENT_DOMAIN[c.agent as AgentConfigSummary["name"]],
    humanLeadRole: c.humanLeadRole,
    humanLeadUserId: c.humanLeadUserId ?? undefined,
    humanLeadName: c.humanLeadUserId ? userName.get(c.humanLeadUserId) : undefined,
    mandate: c.mandate ?? undefined,
    enabled: c.enabled,
    autoApproveT1: c.autoApproveT1,
    modelTier: c.modelTier === "smart" ? "smart" : "fast",
    health: c.enabled ? "healthy" : "disabled",
    pendingApprovals: 0,
    runsToday: 0,
    costUsdToday: 0,
  }));

  return {
    org: { id: ev.orgId, name: org?.name ?? "", slug: org?.slug ?? "" },
    users: users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })),
    memberships: memberships.map((m) => ({
      id: m.id,
      orgId: m.orgId,
      eventId: m.eventId,
      userId: m.userId,
      role: m.role,
      domains: m.domains,
    })),
    personas: {},
    event: {
      id: ev.id,
      orgId: ev.orgId,
      slug: ev.slug,
      name: ev.name,
      type: ev.type as EventWorld["event"]["type"],
      tagline: ev.tagline ?? undefined,
      description: ev.description,
      startsAt: ev.startsAt.toISOString(),
      endsAt: ev.endsAt.toISOString(),
      timezone: "Asia/Kolkata",
      venue: ev.venue,
      capacity: ev.capacity,
      status: ev.status as EventWorld["event"]["status"],
      settings: ev.settings,
      brief: ev.brief ?? undefined,
      version: ev.version,
      createdAt: ev.createdAt.toISOString(),
    },
    rooms: rooms.map((r) => ({
      id: r.id,
      eventId: r.eventId,
      name: r.name,
      building: r.building ?? undefined,
      kind: r.kind as EventWorld["rooms"][number]["kind"],
      capacity: r.capacity,
      features: r.features,
      version: r.version,
    })),
    tracks: tracks.map((x) => ({
      id: x.id,
      eventId: x.eventId,
      name: x.name,
      description: x.description ?? undefined,
    })),
    sessions: sessions.map((s) => ({
      id: s.id,
      eventId: s.eventId,
      trackId: s.trackId ?? undefined,
      roomId: s.roomId,
      title: s.title,
      description: s.description ?? undefined,
      kind: s.kind as EventWorld["sessions"][number]["kind"],
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      capacity: s.capacity,
      registeredCount: chosenCount.get(s.id) ?? 0,
      speakerIds: (speakersBySession.get(s.id) ?? []).map((l) => l.speakerId),
      status: s.status as EventWorld["sessions"][number]["status"],
      delayMinutes: s.delayMinutes,
      version: s.version,
    })),
    speakers: speakers.map((s) => ({
      id: s.id,
      eventId: s.eventId,
      name: s.name,
      title: s.title ?? undefined,
      organization: s.organization ?? undefined,
      bio: s.bio ?? undefined,
      email: decryptOptional(s.emailEnc),
      phone: decryptOptional(s.phoneEnc),
      status: s.status as EventWorld["speakers"][number]["status"],
      sessionIds: links.filter((l) => l.speakerId === s.id).map((l) => l.sessionId),
      requirementsSubmitted: false,
      version: s.version,
    })),
    registrations,
    teams: teams.map((x) => ({
      id: x.id,
      eventId: x.eventId,
      name: x.name,
      memberIds: regs.filter((r) => r.teamId === x.id).map((r) => r.id),
    })),
    tickets: tickets.map((x) => ({
      id: x.id,
      eventId: x.eventId,
      registrationId: x.registrationId,
      token: x.token,
      issuedAt: x.issuedAt.toISOString(),
      expiresAt: x.expiresAt.toISOString(),
      revoked: x.revoked,
    })),
    checkins: checkins.map(({ c, scannerName }) => ({
      id: c.id,
      eventId: c.eventId,
      ticketId: c.ticketId,
      registrationId: c.registrationId,
      sessionId: c.sessionId ?? undefined,
      scannerUserId: c.scannerUserId,
      scannerName: scannerName ?? undefined,
      clientId: c.clientId,
      deviceTime: c.deviceTime.toISOString(),
      serverTime: c.serverTime.toISOString(),
      duplicate: c.duplicate,
      originalCheckinId: c.originalCheckinId ?? undefined,
    })),
    volunteers: vols.map((v) => {
      const phone = decryptOptional(v.phoneEnc);
      return {
        id: v.id,
        eventId: v.eventId,
        userId: v.userId ?? undefined,
        name: v.name,
        phoneMasked: phone ? maskPhone(phone) : undefined,
        skills: v.skills,
        maxHours: v.maxHours,
        hoursServed: Math.round((hoursServed.get(v.id) ?? 0) * 10) / 10,
        telegramLinked: false,
        active: v.active,
        version: v.version,
      };
    }),
    availability: avail.map((a) => ({
      id: a.id,
      eventId: a.eventId,
      volunteerId: a.volunteerId,
      start: a.start.toISOString(),
      end: a.end.toISOString(),
    })),
    shifts: shifts.map((s) => ({
      id: s.id,
      eventId: s.eventId,
      role: s.role,
      roomId: s.roomId ?? undefined,
      sessionId: s.sessionId ?? undefined,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      requiredCount: s.requiredCount,
      skills: s.skills,
      version: s.version,
    })),
    shiftAssignments: assigns.map((a) => ({
      id: a.id,
      shiftId: a.shiftId,
      volunteerId: a.volunteerId,
      status: a.status as EventWorld["shiftAssignments"][number]["status"],
      checkedInAt: iso(a.checkedInAt),
      version: a.version,
    })),
    tasks: tasks.map((x) => ({
      id: x.id,
      eventId: x.eventId,
      title: x.title,
      description: x.description ?? undefined,
      assigneeVolunteerId: x.assigneeVolunteerId ?? undefined,
      roomId: x.roomId ?? undefined,
      incidentId: x.incidentId ?? undefined,
      status: x.status as EventWorld["tasks"][number]["status"],
      priority: x.priority as EventWorld["tasks"][number]["priority"],
      dueAt: iso(x.dueAt),
      createdAt: x.createdAt.toISOString(),
      version: x.version,
    })),
    incidents: incidents.map((x) => ({
      id: x.id,
      eventId: x.eventId,
      title: x.title,
      category: x.category as EventWorld["incidents"][number]["category"],
      severity: x.severity as EventWorld["incidents"][number]["severity"],
      status: x.status as EventWorld["incidents"][number]["status"],
      source: x.source as EventWorld["incidents"][number]["source"],
      description: x.description,
      roomId: x.roomId ?? undefined,
      emergency: x.emergency,
      reportedByUserId: x.reportedByUserId ?? undefined,
      createdAt: x.createdAt.toISOString(),
      resolvedAt: iso(x.resolvedAt),
      version: x.version,
    })),
    kbDocuments: kb.map((d) => ({
      id: d.id,
      eventId: d.eventId,
      title: d.title,
      kind: d.kind as EventWorld["kbDocuments"][number]["kind"],
      mimeType: d.mimeType,
      version: d.version,
      status: d.status,
      public: d.public,
      chunkCount: d.chunkCount,
      updatedAt: d.updatedAt.toISOString(),
    })),
    conversations: [],
    messages: [],
    escalations: [],
    announcements: anns.map((a) => ({
      id: a.id,
      eventId: a.eventId,
      title: a.title,
      body: a.body,
      bodyByChannel: a.bodyByChannel,
      segment: a.segment,
      channels: a.channels,
      category: a.category as EventWorld["announcements"][number]["category"],
      public: a.public,
      status: a.status as EventWorld["announcements"][number]["status"],
      scheduledFor: iso(a.scheduledFor),
      sentAt: iso(a.sentAt),
      recipientCount: a.recipientCount,
      approvedByRole:
        (a.approvedByRole as EventWorld["announcements"][number]["approvedByRole"]) ?? undefined,
      draftedBy: (a.draftedBy as EventWorld["announcements"][number]["draftedBy"]) ?? undefined,
      proposalId: a.proposalId ?? undefined,
    })),
    milestones: milestones.map((x) => ({
      id: x.id,
      eventId: x.eventId,
      title: x.title,
      domain: x.domain as EventWorld["milestones"][number]["domain"],
      dueOn: x.dueOn,
      status: x.status as EventWorld["milestones"][number]["status"],
      ownerRole: x.ownerRole as EventWorld["milestones"][number]["ownerRole"],
      dependsOn: x.dependsOn,
      critical: x.critical,
      completedAt: iso(x.completedAt),
      version: x.version,
    })),
    budgetCategories: cats.map((c) => ({
      id: c.id,
      eventId: c.eventId,
      key: c.key,
      name: c.name,
      capInr: c.capInr,
      version: c.version,
    })),
    ledgerEntries: ledger.map((l) => ({
      id: l.id,
      eventId: l.eventId,
      type: l.type,
      categoryId: l.categoryId ?? undefined,
      amountInr: l.amountInr,
      status: l.status as EventWorld["ledgerEntries"][number]["status"],
      vendor: l.vendor ?? undefined,
      source: (l.source as EventWorld["ledgerEntries"][number]["source"]) ?? undefined,
      sponsorId: l.sponsorId ?? undefined,
      note: l.note,
      evidenceRef: l.evidenceRef ?? undefined,
      occurredOn: l.occurredOn,
      proposalId: l.proposalId ?? undefined,
      createdAt: l.createdAt.toISOString(),
    })),
    quotes: quotes.map((q) => ({
      id: q.id,
      eventId: q.eventId,
      title: q.title,
      categoryId: q.categoryId ?? undefined,
      rows: q.rows,
      recommendedVendor: q.recommendedVendor ?? undefined,
      createdAt: q.createdAt.toISOString(),
    })),
    sponsorProspects: sponsors.map((s) => ({
      id: s.id,
      eventId: s.eventId,
      name: s.name,
      stage: s.stage as EventWorld["sponsorProspects"][number]["stage"],
      tier: (s.tier as EventWorld["sponsorProspects"][number]["tier"]) ?? undefined,
      fitReason: s.fitReason,
      contactName: s.contactName ?? undefined,
      askInr: s.askInr ?? undefined,
      committedInr: s.committedInr ?? undefined,
      lastTouchAt: iso(s.lastTouchAt),
      nextFollowUpAt: iso(s.nextFollowUpAt),
      deliverables: (deliverablesBySponsor.get(s.id) ?? []).map((d) => ({
        id: d.id,
        title: d.title,
        status: d.status as "pending" | "in_progress" | "done",
        dueOn: d.dueOn ?? undefined,
      })),
      version: s.version,
    })),
    marketingPosts: posts.map((p) => ({
      id: p.id,
      eventId: p.eventId,
      platform: p.platform as EventWorld["marketingPosts"][number]["platform"],
      body: p.body,
      hashtags: p.hashtags,
      status: p.status as EventWorld["marketingPosts"][number]["status"],
      scheduledFor: iso(p.scheduledFor),
      postedAt: iso(p.postedAt),
    })),
    funnel: funnel.map((f) => ({ date: f.date, registrations: f.registrations, target: f.target })),
    checklists: checklists.map((c) => ({
      id: c.id,
      eventId: c.eventId,
      title: c.title,
      scope: { type: c.scopeType, ref: c.scopeRef ?? undefined },
      items: (itemsByChecklist.get(c.id) ?? []).map((i) => ({
        id: i.id,
        label: i.label,
        status: i.status as "todo" | "in_progress" | "done" | "blocked",
        notes: i.notes ?? undefined,
      })),
      version: c.version,
    })),
    inventory: inventory.map((i) => ({
      id: i.id,
      eventId: i.eventId,
      name: i.name,
      count: i.count,
      unit: i.unit ?? undefined,
    })),
    proposals: [],
    agents,
    agentRuns: [],
    agentSteps: [],
    domainEvents: [],
    briefings: briefings.map((b) => ({
      id: b.id,
      eventId: b.eventId,
      date: b.date,
      scope: b.scope,
      sections: b.sections,
      facts: b.facts,
      generatedBy: b.generatedBy,
      generatedAt: b.generatedAt.toISOString(),
    })),
    whatIfRuns: [],
    playbookLessons: lessons.map((l) => ({
      id: l.id,
      eventType: l.eventType as EventWorld["event"]["type"],
      title: l.title,
      lesson: l.lesson,
      tags: l.tags,
      sourceEventId: l.sourceEventId ?? undefined,
      createdAt: l.createdAt.toISOString(),
    })),
    now: now.toISOString(),
  };
}

type SearchKb = ReadServices["searchKb"];

/**
 * Read services for one agent run, bound to the actor's event. The world loads lazily on the
 * first call and is reused for the rest of the run.
 */
export function createReadServices(
  actor: Actor,
  opts: { client?: Db; searchKb?: SearchKb } = {},
): ReadServices {
  const eventId = actor.eventId;
  if (!eventId) throw new Error("Read services need an actor bound to an event");
  const client = opts.client ?? defaultDb;
  let loaded: Promise<ReadServices> | undefined;
  const search: SearchKb =
    opts.searchKb ??
    (async (query, k) => {
      const { searchKbPg } = await import("@/ai/rag/pg");
      return searchKbPg(client, eventId, query, k);
    });
  const get = () =>
    (loaded ??= loadWorld(eventId, client).then((w) => worldServices(w, { searchKb: search })));
  return {
    now: () => nowUtc().toISOString(),
    event: async () => (await get()).event(),
    rooms: async () => (await get()).rooms(),
    tracks: async () => (await get()).tracks(),
    sessions: async () => (await get()).sessions(),
    speakers: async () => (await get()).speakers(),
    sessionChoices: async (ids) => (await get()).sessionChoices(ids),
    registrations: async (q) => (await get()).registrations(q),
    volunteers: async () => (await get()).volunteers(),
    shifts: async () => (await get()).shifts(),
    shiftAssignments: async () => (await get()).shiftAssignments(),
    availability: async () => (await get()).availability(),
    announcements: async (since) => (await get()).announcements(since),
    kbDocuments: async () => (await get()).kbDocuments(),
    searchKb: (query, k) => search(query, k),
    lessons: async () => (await get()).lessons(),
    incidents: async () => (await get()).incidents(),
    tasks: async () => (await get()).tasks(),
    milestones: async () => (await get()).milestones(),
    budget: async () => (await get()).budget(),
    quotes: async () => (await get()).quotes(),
    sponsors: async () => (await get()).sponsors(),
    marketing: async () => (await get()).marketing(),
    checklists: async () => (await get()).checklists(),
    inventory: async () => (await get()).inventory(),
    // Straight from the table: Radar reads this on every check-in, so it must not load the whole event.
    checkins: async (since) => {
      const rows = await client
        .select({ c: t.checkins, scannerName: t.users.name })
        .from(t.checkins)
        .leftJoin(t.users, eq(t.users.id, t.checkins.scannerUserId))
        .where(
          and(
            eq(t.checkins.eventId, eventId),
            since ? gte(t.checkins.serverTime, new Date(since)) : undefined,
          ),
        );
      return rows.map(({ c, scannerName }) => ({
        id: c.id,
        eventId: c.eventId,
        ticketId: c.ticketId,
        registrationId: c.registrationId,
        sessionId: c.sessionId ?? undefined,
        scannerUserId: c.scannerUserId,
        scannerName: scannerName ?? undefined,
        clientId: c.clientId,
        deviceTime: c.deviceTime.toISOString(),
        serverTime: c.serverTime.toISOString(),
        duplicate: c.duplicate,
        originalCheckinId: c.originalCheckinId ?? undefined,
      }));
    },
    speakerRoster: async () => (await get()).speakerRoster(),
    // Not part of the loaded world (messages can be many), so read straight from the table.
    helpdeskQuestions: async (since) => {
      const rows = await client
        .select({
          messageId: t.messages.id,
          text: t.messages.body,
          at: t.messages.at,
          channel: t.conversations.channel,
        })
        .from(t.messages)
        .innerJoin(t.conversations, eq(t.conversations.id, t.messages.conversationId))
        .where(
          and(
            eq(t.messages.eventId, eventId),
            eq(t.messages.role, "user"),
            gte(t.messages.at, new Date(since)),
          ),
        )
        .orderBy(asc(t.messages.at))
        .limit(500);
      return rows.map((r) => ({ ...r, at: r.at.toISOString() }));
    },
  };
}
