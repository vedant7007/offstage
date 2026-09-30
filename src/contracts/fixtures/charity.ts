import type { AgentConfigSummary } from "../agents";
import type {
  Announcement,
  Availability,
  BudgetCategory,
  Event,
  EventMembership,
  KbDocument,
  LedgerEntry,
  Milestone,
  Registration,
  Room,
  Session,
  Shift,
  ShiftAssignment,
  User,
  Volunteer,
} from "../domain";
import { AGENT_DOMAIN, AgentName, type Domain, type Role } from "../identity";
import { ist, makeFaker, stableId } from "./rng";
import type { EventWorld } from "./world";

const NS = "raktdaan";
const id = (kind: string, key: string | number) => stableId(`${NS}:${kind}`, key);

export const CHARITY_SLUG = "raktdaan-2026";
const DAY = "2026-11-14";

/**
 * A small charity blood-donation drive, the second seeded event. It proves templates:
 * different agents are on, there are no sponsors, marketing or OD letters, and the
 * ledger records donations and in-kind support.
 */
export function buildCharityDrive(hacknova: Pick<EventWorld, "org" | "personas">): EventWorld {
  const f = makeFaker(1411);
  const orgId = hacknova.org.id;
  const eventId = id("event", CHARITY_SLUG);
  const createdAt = ist("2026-10-01", "10:00");
  const now = ist("2026-11-10", "18:00");
  const owner = hacknova.personas.owner!;
  const volunteerPersona = hacknova.personas.volunteer!;
  const attendeePersona = hacknova.personas.attendee!;

  // Personas carry over: the owner runs this too, Ravi volunteers, Sneha donates.
  const memberships: EventMembership[] = [
    { id: id("membership", owner.email), orgId, eventId, userId: owner.userId, role: "owner", domains: [] },
    {
      id: id("membership", volunteerPersona.email),
      orgId,
      eventId,
      userId: volunteerPersona.userId,
      role: "volunteer",
      domains: [],
    },
    {
      id: id("membership", attendeePersona.email),
      orgId,
      eventId,
      userId: attendeePersona.userId,
      role: "attendee",
      domains: [],
    },
  ];
  const users: User[] = [];

  const event: Event = {
    id: eventId,
    orgId,
    slug: CHARITY_SLUG,
    name: "Raktdaan 2026: Blood Donation Drive",
    type: "charity_drive",
    tagline: "One unit can help save three lives",
    description:
      "The NSS unit of Deccan Institute runs its annual blood donation drive with the district blood bank. Donors are screened on site; refreshments and a donor certificate for everyone who donates.",
    startsAt: ist(DAY, "09:00"),
    endsAt: ist(DAY, "16:00"),
    timezone: "Asia/Kolkata",
    venue: { name: "Deccan Institute, Block A", address: "Main Gate, Gandipet Road", city: "Hyderabad" },
    capacity: 150,
    status: "planning",
    settings: {
      mealPlan: [],
      t3MoneyThresholdInr: 5_000,
      broadcastT3Recipients: 100,
      facultyApproverRequired: false,
      autoApproveT1: true,
      quietHours: { startHour: 22, endHour: 7 },
      perPersonHourlyCap: 3,
      registrationTarget: 120,
      odLettersEnabled: false,
      certificatesEnabled: true,
      proposalTtlMinutes: 30,
    },
    brief: {
      name: "Raktdaan 2026",
      type: "charity_drive",
      dates: [DAY],
      venue: "Deccan Institute, Block A",
      expectedAttendance: 120,
      paid: false,
      budgetInr: 20_000,
      sponsorsExpected: false,
      food: true,
      volunteersAvailable: 8,
      attendeeChannels: ["in_app", "email", "whatsapp"],
    },
    version: 1,
    createdAt,
  };

  const rooms: Room[] = [
    {
      id: id("room", "hall"),
      eventId,
      name: "Donation Hall (Seminar Hall 1)",
      building: "Block A",
      kind: "hall",
      capacity: 40,
      features: ["ac", "wheelchair_access"],
      version: 1,
    },
    {
      id: id("room", "screening"),
      eventId,
      name: "Screening Room A-102",
      building: "Block A",
      kind: "classroom",
      capacity: 20,
      features: [],
      version: 1,
    },
  ];
  const sessions: Session[] = [
    {
      id: id("session", "camp"),
      eventId,
      roomId: rooms[0]!.id,
      title: "Donation camp",
      kind: "other",
      startsAt: ist(DAY, "09:30"),
      endsAt: ist(DAY, "15:30"),
      capacity: 150,
      registeredCount: 0,
      speakerIds: [],
      status: "scheduled",
      delayMinutes: 0,
      version: 1,
      description: "Screening, donation and rest, about 45 minutes per donor.",
    },
    {
      id: id("session", "talk"),
      eventId,
      roomId: rooms[1]!.id,
      title: "Why donate: a talk by the district blood bank",
      kind: "talk",
      startsAt: ist(DAY, "09:00"),
      endsAt: ist(DAY, "09:30"),
      capacity: 20,
      registeredCount: 0,
      speakerIds: [],
      status: "scheduled",
      delayMinutes: 0,
      version: 1,
    },
  ];

  const registrations: Registration[] = [];
  for (let i = 0; i < 64; i++) {
    const isSneha = i === 0;
    const first = isSneha ? "Sneha" : f.person.firstName();
    const last = isSneha ? "Reddy" : f.person.lastName();
    registrations.push({
      id: id("registration", i),
      eventId,
      userId: isSneha ? attendeePersona.userId : undefined,
      name: `${first} ${last}`,
      email: isSneha
        ? attendeePersona.email
        : `${first}.${last}.donor${i}@example.com`.toLowerCase().replace(/[^a-z0-9.@]/g, ""),
      college: "Deccan Institute of Engineering and Technology",
      department: f.helpers.arrayElement(["CSE", "ECE", "IT", "EEE", "Mechanical"]),
      year: f.number.int({ min: 2, max: 4 }),
      section: f.helpers.arrayElement(["A", "B", "C"]),
      status: "confirmed",
      sessionChoices: [sessions[0]!.id],
      foodPref: f.helpers.arrayElement(["veg", "non_veg"] as const),
      adultConfirmed: true,
      guardianConsent: false,
      consentVersion: "2026-09",
      createdAt: new Date(new Date(ist("2026-10-20", "10:00")).getTime() + i * 3 * 3_600_000).toISOString(),
      version: 1,
    });
  }
  sessions[0]!.registeredCount = registrations.length;

  const volunteers: Volunteer[] = [];
  for (let i = 0; i < 8; i++) {
    const isRavi = i === 0;
    const name = isRavi ? volunteerPersona.name : f.person.fullName();
    let userId = volunteerPersona.userId;
    if (!isRavi) {
      const email = `${name.toLowerCase().replace(/[^a-z]+/g, ".")}.nss${i}@example.com`;
      userId = id("user", email);
      users.push({ id: userId, name, email, createdAt });
      memberships.push({
        id: id("membership", email),
        orgId,
        eventId,
        userId,
        role: "volunteer",
        domains: [],
      });
    }
    volunteers.push({
      id: id("volunteer", i),
      eventId,
      userId,
      name,
      phoneMasked: `+91 ******${String(2000 + i * 53).slice(-4)}`,
      skills: i < 2 ? ["registration_desk", "helpdesk"] : i < 5 ? ["crowd", "runner"] : ["food", "first_aid"],
      maxHours: 7,
      hoursServed: 0,
      telegramLinked: false,
      active: true,
      version: 1,
    });
  }
  const shifts: Shift[] = [
    {
      id: id("shift", "desk"),
      eventId,
      role: "Donor registration desk",
      startsAt: ist(DAY, "08:45"),
      endsAt: ist(DAY, "15:30"),
      requiredCount: 2,
      skills: ["registration_desk"],
      version: 1,
    },
    {
      id: id("shift", "floor"),
      eventId,
      role: "Donation floor runners",
      roomId: rooms[0]!.id,
      startsAt: ist(DAY, "09:15"),
      endsAt: ist(DAY, "15:45"),
      requiredCount: 3,
      skills: ["crowd"],
      version: 1,
    },
    {
      id: id("shift", "refresh"),
      eventId,
      role: "Refreshments and rest area",
      startsAt: ist(DAY, "09:30"),
      endsAt: ist(DAY, "16:00"),
      requiredCount: 3,
      skills: ["food"],
      version: 1,
    },
  ];
  const shiftAssignments: ShiftAssignment[] = [
    ...[0, 1].map((v) => ({
      id: id("assignment", `desk:${v}`),
      shiftId: shifts[0]!.id,
      volunteerId: volunteers[v]!.id,
      status: "assigned" as const,
      version: 1,
    })),
    ...[2, 3, 4].map((v) => ({
      id: id("assignment", `floor:${v}`),
      shiftId: shifts[1]!.id,
      volunteerId: volunteers[v]!.id,
      status: "assigned" as const,
      version: 1,
    })),
    ...[5, 6, 7].map((v) => ({
      id: id("assignment", `refresh:${v}`),
      shiftId: shifts[2]!.id,
      volunteerId: volunteers[v]!.id,
      status: "assigned" as const,
      version: 1,
    })),
  ];

  const availability: Availability[] = volunteers.map((v) => ({
    id: id("availability", v.id),
    eventId,
    volunteerId: v.id,
    start: ist(DAY, "08:30"),
    end: ist(DAY, "16:30"),
  }));

  const kbDocuments: KbDocument[] = [
    {
      id: "kb-raktdaan-faq",
      eventId,
      title: "Donor FAQ",
      kind: "faq",
      mimeType: "text/markdown",
      version: 1,
      status: "ready",
      public: true,
      chunkCount: 9,
      updatedAt: ist("2026-10-25", "12:00"),
    },
    {
      id: "kb-raktdaan-eligibility",
      eventId,
      title: "Donor eligibility checklist",
      kind: "policy",
      mimeType: "text/markdown",
      version: 1,
      status: "ready",
      public: true,
      chunkCount: 5,
      updatedAt: ist("2026-10-25", "12:00"),
    },
  ];

  const announcements: Announcement[] = [
    {
      id: id("announcement", "eligibility"),
      eventId,
      title: "Before you donate",
      body: "Eat a proper breakfast, drink water, and bring a photo ID. Donors must be 18 to 65 and weigh at least 50 kg.",
      bodyByChannel: {
        in_app:
          "Eat a proper breakfast, drink water, and bring a photo ID. Donors must be 18 to 65 and weigh at least 50 kg.",
      },
      segment: { type: "all" },
      channels: ["in_app"],
      category: "info",
      public: true,
      status: "sent",
      sentAt: ist("2026-11-07", "10:00"),
      recipientCount: 50,
      approvedByRole: "owner",
      draftedBy: "herald",
    },
  ];

  const ms = (
    key: string,
    title: string,
    domain: Domain,
    dueOn: string,
    status: Milestone["status"],
    critical = false,
  ): Milestone => ({
    id: id("milestone", key),
    eventId,
    title,
    domain,
    dueOn,
    status,
    ownerRole: "owner",
    dependsOn: [],
    critical,
    completedAt: status === "done" ? ist(dueOn, "17:00") : undefined,
    version: 1,
  });
  const milestones: Milestone[] = [
    ms("bloodbank", "Confirm date with the district blood bank", "planning", "2026-10-10", "done", true),
    ms("permission", "Principal's permission letter", "planning", "2026-10-15", "done", true),
    ms("donors", "Reach 120 pledged donors", "registrations", "2026-11-12", "in_progress"),
    ms("refresh", "Order refreshments (juice, biscuits, bananas)", "logistics", "2026-11-12", "not_started"),
    ms("certs", "Email donor certificates", "post_event", "2026-11-18", "not_started"),
  ];

  const budgetCategories: BudgetCategory[] = [
    {
      id: id("budget", "refreshments"),
      eventId,
      key: "refreshments",
      name: "Refreshments",
      capInr: 12_000,
      version: 1,
    },
    {
      id: id("budget", "printing"),
      eventId,
      key: "printing",
      name: "Posters and certificates",
      capInr: 4_000,
      version: 1,
    },
    { id: id("budget", "misc"), eventId, key: "misc", name: "Miscellaneous", capInr: 4_000, version: 1 },
  ];
  const ledgerEntries: LedgerEntry[] = [
    {
      id: id("ledger", "donation-alumni"),
      eventId,
      type: "income",
      source: "donation",
      amountInr: 15_000,
      status: "received",
      note: "Alumni association donation",
      occurredOn: "2026-10-28",
      createdAt: ist("2026-10-28", "12:00"),
    },
    {
      id: id("ledger", "posters"),
      eventId,
      type: "expense",
      categoryId: budgetCategories[1]!.id,
      amountInr: 1_200,
      status: "paid",
      vendor: "Print Hub Gandipet",
      note: "30 A3 posters",
      occurredOn: "2026-11-01",
      createdAt: ist("2026-11-01", "12:00"),
    },
  ];

  // Template choice for a charity drive: no sponsorship, marketing, scheduler or speaker liaison.
  const OFF: AgentName[] = ["sponsorship", "marketing", "scheduler", "speaker_liaison"];
  const leadRole: Role = "owner";
  const agents: AgentConfigSummary[] = AgentName.options.map((name) => ({
    name,
    domain: AGENT_DOMAIN[name],
    humanLeadRole: leadRole,
    humanLeadUserId: owner.userId,
    humanLeadName: owner.name,
    enabled: !OFF.includes(name),
    autoApproveT1: true,
    modelTier: name === "commander" || name === "chronicler" || name === "finance" ? "smart" : "fast",
    health: OFF.includes(name) ? "disabled" : "healthy",
    pendingApprovals: 0,
    runsToday: 0,
    costUsdToday: 0,
  }));

  return {
    org: hacknova.org,
    users,
    memberships,
    personas: { owner, volunteer: volunteerPersona, attendee: attendeePersona },
    event,
    rooms,
    tracks: [],
    sessions,
    speakers: [],
    registrations,
    teams: [],
    tickets: [],
    checkins: [],
    volunteers,
    availability,
    shifts,
    shiftAssignments,
    tasks: [],
    incidents: [],
    kbDocuments,
    conversations: [],
    messages: [],
    escalations: [],
    announcements,
    milestones,
    budgetCategories,
    ledgerEntries,
    quotes: [],
    sponsorProspects: [],
    marketingPosts: [],
    funnel: [],
    checklists: [],
    inventory: [
      { id: id("inventory", "juice"), eventId, name: "Juice packs", count: 0, unit: "packs" },
      { id: id("inventory", "certs"), eventId, name: "Printed donor cards", count: 150, unit: "cards" },
    ],
    proposals: [],
    agents,
    agentRuns: [],
    agentSteps: [],
    domainEvents: [],
    briefings: [],
    whatIfRuns: [],
    playbookLessons: [],
    now,
  };
}
