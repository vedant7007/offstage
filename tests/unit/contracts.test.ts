import { describe, expect, it } from "vitest";
import type { z } from "zod";
import * as C from "@/contracts";
import { fixtures, makeProposal, type EventWorld } from "@/contracts/fixtures";
import { buildHackNova } from "@/contracts/fixtures/hacknova";

function expectValid(schema: z.ZodType, value: unknown, label: string) {
  const r = schema.safeParse(value);
  if (!r.success) {
    const first = r.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`${label} does not match its schema:\n${first.join("\n")}`);
  }
}

/** Every array in a world, with the schema its items must satisfy. */
function worldTables(w: EventWorld): [string, z.ZodType, unknown[]][] {
  return [
    ["users", C.User, w.users],
    ["memberships", C.EventMembership, w.memberships],
    ["rooms", C.Room, w.rooms],
    ["tracks", C.Track, w.tracks],
    ["sessions", C.Session, w.sessions],
    ["speakers", C.Speaker, w.speakers],
    ["registrations", C.Registration, w.registrations],
    ["teams", C.Team, w.teams],
    ["tickets", C.Ticket, w.tickets],
    ["checkins", C.Checkin, w.checkins],
    ["volunteers", C.Volunteer, w.volunteers],
    ["shifts", C.Shift, w.shifts],
    ["shiftAssignments", C.ShiftAssignment, w.shiftAssignments],
    ["tasks", C.Task, w.tasks],
    ["incidents", C.Incident, w.incidents],
    ["kbDocuments", C.KbDocument, w.kbDocuments],
    ["conversations", C.Conversation, w.conversations],
    ["messages", C.Message, w.messages],
    ["escalations", C.Escalation, w.escalations],
    ["announcements", C.Announcement, w.announcements],
    ["milestones", C.Milestone, w.milestones],
    ["budgetCategories", C.BudgetCategory, w.budgetCategories],
    ["ledgerEntries", C.LedgerEntry, w.ledgerEntries],
    ["quotes", C.Quote, w.quotes],
    ["sponsorProspects", C.SponsorProspect, w.sponsorProspects],
    ["marketingPosts", C.MarketingPost, w.marketingPosts],
    ["funnel", C.FunnelSnapshot, w.funnel],
    ["checklists", C.Checklist, w.checklists],
    ["inventory", C.InventoryItem, w.inventory],
    ["proposals", C.ActionProposal, w.proposals],
    ["agents", C.AgentConfigSummary, w.agents],
    ["agentRuns", C.AgentRun, w.agentRuns],
    ["agentSteps", C.AgentStep, w.agentSteps],
    ["domainEvents", C.DomainEvent, w.domainEvents],
    ["briefings", C.Briefing, w.briefings],
    ["whatIfRuns", C.WhatIfResult, w.whatIfRuns],
    ["playbookLessons", C.PlaybookLesson, w.playbookLessons],
  ];
}

describe("fixture worlds match the contracts", () => {
  for (const w of fixtures.worlds()) {
    describe(w.event.slug, () => {
      it("event, org and every table parse", () => {
        expectValid(C.Org, w.org, "org");
        expectValid(C.Event, w.event, "event");
        for (const [name, schema, rows] of worldTables(w)) {
          rows.forEach((row, i) => expectValid(schema, row, `${w.event.slug}.${name}[${i}]`));
        }
      });

      it("every row belongs to this event", () => {
        for (const [name, , rows] of worldTables(w)) {
          for (const row of rows as { eventId?: string }[]) {
            if (row.eventId !== undefined) expect(row.eventId, name).toBe(w.event.id);
          }
        }
      });

      it("ids are unique within each table", () => {
        for (const [name, , rows] of worldTables(w)) {
          const ids = (rows as { id?: string }[]).map((r) => r.id).filter(Boolean);
          expect(new Set(ids).size, name).toBe(ids.length);
        }
      });

      it("typed domain event payloads parse", () => {
        for (const e of w.domainEvents) {
          if (e.type in C.DomainEventPayloads) {
            expect(C.parseEventPayload(e.type as C.TypedEventType, e.payload), e.type).not.toBeNull();
          }
        }
      });

      it("contains no em dashes anywhere", () => {
        expect(JSON.stringify(w)).not.toContain(String.fromCharCode(0x2014));
      });
    });
  }
});

describe("HackNova world matches blueprint Section 11", () => {
  const w = fixtures.eventFull();
  const confirmed = w.registrations.filter((r) => r.status === "confirmed");

  it("has the seeded numbers", () => {
    expect(w.event.slug).toBe("hacknova-2026");
    expect(w.rooms).toHaveLength(4);
    expect(w.tracks).toHaveLength(3);
    expect(w.sessions).toHaveLength(16);
    expect(w.speakers).toHaveLength(12);
    expect(confirmed).toHaveLength(320);
    expect(w.registrations.filter((r) => r.status === "waitlisted")).toHaveLength(40);
    expect(w.volunteers).toHaveLength(28);
    expect(w.sponsorProspects).toHaveLength(6);
    expect(new Set(w.sponsorProspects.map((s) => s.stage)).size).toBe(6);
    expect(w.event.settings.registrationTarget).toBe(500);
  });

  it("has a 3 lakh budget across 6 categories, about 40% used, catering at 92%", () => {
    const s = fixtures.financeSummary();
    expect(s.categories).toHaveLength(6);
    expect(s.totalCapInr).toBe(300_000);
    expect((s.spentInr + s.committedInr) / s.totalCapInr).toBeCloseTo(0.4, 2);
    const catering = s.categories.find((c) => c.key === "catering")!;
    expect(catering.usedRatio).toBeCloseTo(0.92, 4);
    expect(catering.flag).toBe("warn_80");
  });

  it("has the pre-seeded tensions", () => {
    const lab204 = w.rooms.find((r) => r.name === "Lab 204")!;
    expect(lab204.capacity).toBe(60);
    const overbooked = w.sessions.find((s) => s.roomId === lab204.id && s.registeredCount === 95);
    expect(overbooked).toBeDefined();

    const judging = w.sessions.find((s) => s.kind === "judging")!;
    const doubleBooked = w.sessions.find(
      (s) =>
        s.id !== judging.id &&
        s.startsAt < judging.endsAt &&
        judging.startsAt < s.endsAt &&
        s.speakerIds.some((id) => judging.speakerIds.includes(id)),
    );
    expect(doubleBooked).toBeDefined();
  });

  it("matches the helpdesk KB facts", () => {
    expect(w.kbDocuments.map((d) => d.id).sort()).toEqual(["kb-faq", "kb-menu", "kb-rulebook", "kb-venue"]);
    expect(w.event.startsAt.startsWith("2026-10-24")).toBe(true);
    expect(w.rooms.map((r) => `${r.name}:${r.capacity}`).sort()).toEqual([
      "Lab 101:80",
      "Lab 204:60",
      "Main Auditorium:400",
      "Seminar Hall 3:120",
    ]);
  });

  it("registered counts come from session choices and nobody picks two overlapping sessions", () => {
    for (const s of w.sessions) {
      expect(confirmed.filter((r) => r.sessionChoices.includes(s.id)).length, s.title).toBe(
        s.registeredCount,
      );
    }
    const byId = new Map(w.sessions.map((s) => [s.id, s]));
    for (const r of confirmed) {
      const mine = r.sessionChoices.map((id) => byId.get(id)!);
      for (let i = 0; i < mine.length; i++)
        for (let j = i + 1; j < mine.length; j++) {
          const a = mine[i]!;
          const b = mine[j]!;
          expect(a.startsAt < b.endsAt && b.startsAt < a.endsAt, `${r.id} ${a.title} / ${b.title}`).toBe(
            false,
          );
        }
    }
  });

  it("has every demo persona with a membership", () => {
    for (const p of C.DemoPersona.options) {
      const persona = w.personas[p];
      expect(persona, p).toBeDefined();
      expect(w.memberships.some((m) => m.userId === persona!.userId)).toBe(true);
    }
    expect(w.registrations[0]!.email).toBe(w.personas.attendee!.email);
  });

  it("first scan wins and the second is flagged as a duplicate", () => {
    const dup = w.checkins.find((c) => c.duplicate)!;
    const original = w.checkins.find((c) => c.id === dup.originalCheckinId)!;
    expect(original.registrationId).toBe(dup.registrationId);
    expect(original.duplicate).toBe(false);
  });

  it("is deterministic", () => {
    expect(JSON.stringify(buildHackNova())).toBe(JSON.stringify(buildHackNova()));
  });

  it("returns copies, so callers cannot corrupt the shared world", () => {
    const a = fixtures.eventFull();
    a.sessions[0]!.title = "changed";
    expect(fixtures.eventFull().sessions[0]!.title).not.toBe("changed");
  });
});

describe("single fixtures and API responses", () => {
  const singles: [string, z.ZodType, unknown][] = [
    ["room", C.Room, fixtures.room()],
    ["session", C.Session, fixtures.session({ title: "Override works" })],
    ["registration", C.Registration, fixtures.registration()],
    ["registrationSummary", C.RegistrationSummary, fixtures.registrationSummary()],
    ["ticketClaims", C.TicketClaims, fixtures.ticketClaims()],
    ["kbChunkRef", C.KbChunkRef, fixtures.kbChunkRef()],
    ["eventBrief", C.EventBrief, fixtures.eventBrief()],
    ["foodCount", C.FoodCount, fixtures.foodCount()],
    ["metricsSnapshot", C.MetricsSnapshot, fixtures.metricsSnapshot()],
    ["financeSummary", C.FinanceSummary, fixtures.financeSummary()],
    ["certificate", C.Certificate, fixtures.certificate()],
    ["odList", C.OdList, fixtures.odList()],
    ["feedback", C.Feedback, fixtures.feedback()],
    ["actor:user", C.Actor, fixtures.actor("user")],
    ["actor:agent", C.Actor, fixtures.actor("agent")],
    ["actor:system", C.Actor, fixtures.actor("system")],
  ];
  const api = fixtures.api;
  const responses: [string, z.ZodType, unknown][] = [
    ["overview", C.OverviewResponse, api.overview()],
    ["listProposals", C.ListProposalsResponse, api.listProposals()],
    ["proposal", C.ProposalResponse, api.proposal()],
    ["agentRun", C.AgentRunResponse, api.agentRun()],
    ...C.DemoPersona.options.map((p): [string, z.ZodType, unknown] => [`me:${p}`, C.MeResponse, api.me(p)]),
    ["myRegistration", C.MyRegistrationResponse, api.myRegistration()],
    ["myTicket", C.MyTicketResponse, api.myTicket()],
    ["mySchedule", C.MyScheduleResponse, api.mySchedule()],
    ["publicEvent", C.PublicEventResponse, api.publicEvent()],
    ["publicStatus", C.PublicStatusResponse, api.publicStatus()],
    ["verifyKey", C.VerifyKeyResponse, api.verifyKey()],
    ["crewShifts", C.CrewShiftsResponse, api.crewShifts()],
    ["crewSearch", C.CrewSearchResponse, api.crewSearch("sn")],
    ["checkin:fresh", C.CheckinResult, api.checkinResults().checkedIn],
    ["checkin:duplicate", C.CheckinResult, api.checkinResults().duplicate],
    ["checkin:invalid", C.CheckinResult, api.checkinResults().invalid],
    ["finance", C.FinanceResponse, api.finance()],
    ["sponsors", C.SponsorsResponse, api.sponsors()],
    ["marketing", C.MarketingResponse, api.marketing()],
    ["milestones", C.MilestonesResponse, api.milestones()],
    ["incidents", C.IncidentsResponse, api.incidents()],
    ["chatAnswered", C.ChatResult, api.chatAnswered()],
    ["chatEscalated", C.ChatResult, api.chatEscalated()],
    ["chatBlocked", C.ChatResult, api.chatBlocked()],
    ["certificateVerify", C.CertificateVerifyResponse, api.certificateVerify()],
    ["certificateVerify:revoked", C.CertificateVerifyResponse, api.certificateVerify(true)],
  ];

  for (const [label, schema, value] of [...singles, ...responses]) {
    it(`${label} parses`, () => expectValid(schema, value, label));
  }

  it("applies overrides", () => {
    expect(fixtures.session({ title: "Override works" }).title).toBe("Override works");
  });

  it("revoked certificates verify as invalid", () => {
    expect(api.certificateVerify(true).valid).toBe(false);
  });

  it("milestones report overdue and at-risk items", () => {
    const m = api.milestones();
    expect(m.overdueIds.length).toBeGreaterThan(0);
    expect(m.atRiskIds.length).toBeGreaterThan(0);
  });
});

describe("proposal contract", () => {
  it("has a payload schema for every action kind", () => {
    for (const k of C.ActionKind.options) expect(C.ActionPayloads[k], k).toBeDefined();
    expect(Object.keys(C.ActionPayloads).sort()).toEqual([...C.ActionKind.options].sort());
  });

  it("narrows the payload by kind", () => {
    const p = fixtures.proposal();
    if (p.kind === "schedule.change_room") {
      expect(p.payload.newRoomId).toBeTruthy();
    } else {
      throw new Error("proposal 0 should be a schedule.change_room");
    }
  });

  it("rejects a payload that does not match its kind", () => {
    const good = fixtures.proposal();
    const bad = { ...good, kind: "schedule.move_session" };
    expect(C.ActionProposal.safeParse(bad).success).toBe(false);
  });

  it("requires a body for every announcement channel", () => {
    const r = C.ActionPayloads["comms.send_announcement"].safeParse({
      title: "x",
      segment: { type: "all" },
      channels: ["email", "sms"],
      bodyByChannel: { email: "hello" },
      category: "info",
    });
    expect(r.success).toBe(false);
  });

  it("requires a ref for session segments", () => {
    expect(C.Segment.safeParse({ type: "session" }).success).toBe(false);
    expect(C.Segment.safeParse({ type: "session", ref: "s1" }).success).toBe(true);
  });

  it("parses a propose input and applies payload defaults", () => {
    const input = C.ProposeInput.parse({
      kind: "crew.create_task",
      payload: { title: "Put up signage" },
      summary: "Signage at Block B",
      rationale: "Lunch questions spiked",
      idempotencyKey: "radar:lunch:1",
    });
    expect(input.kind).toBe("crew.create_task");
    if (input.kind === "crew.create_task") expect(input.payload.priority).toBe("normal");
    expect(input.evidence).toEqual([]);
  });

  it("makeProposal builds a valid bundle with children", () => {
    const w = fixtures.eventFull();
    const bundle = makeProposal({
      kind: "plan.bundle",
      eventId: w.event.id,
      proposedBy: fixtures.actor("agent"),
      domain: "schedule",
      riskTier: "T3",
      createdAt: w.now,
      summary: "Replan after the keynote speaker cancelled",
      payload: {
        title: "Speaker cancellation plan",
        children: [
          {
            kind: "schedule.cancel_session",
            payload: { sessionId: w.sessions[0]!.id, reason: "Speaker unwell" },
            summary: "Cancel the opening keynote",
          },
        ],
      },
    });
    expect(bundle.status).toBe("pending");
    expect(bundle.requiredApprovals).toBe(2);
  });

  it("marks emergency categories", () => {
    expect(C.isEmergencyCategory("medical")).toBe(true);
    expect(C.isEmergencyCategory("av")).toBe(false);
  });
});

describe("public announcements carry the drafted-by label data", () => {
  it("includes approvedByRole and draftedBy on public event and status responses", () => {
    for (const list of [
      fixtures.api.publicEvent().announcements,
      fixtures.api.publicStatus().announcements,
    ]) {
      expect(list.length).toBeGreaterThan(0);
      for (const a of list) {
        expect(a.approvedByRole).toBeTruthy();
        expect(a.draftedBy).toBeTruthy();
      }
    }
  });
});
