import type { Faker } from "@faker-js/faker";
import type { AgentConfigSummary, AgentRun, AgentStep } from "../agents";
import type {
  Announcement,
  Availability,
  Briefing,
  BudgetCategory,
  Checkin,
  Checklist,
  Conversation,
  Escalation,
  Event,
  EventMembership,
  FunnelSnapshot,
  Incident,
  InventoryItem,
  KbDocument,
  LedgerEntry,
  MarketingPost,
  Message,
  Milestone,
  PlaybookLesson,
  Quote,
  Registration,
  Room,
  Session,
  Shift,
  ShiftAssignment,
  Speaker,
  SponsorProspect,
  Task,
  Team,
  Ticket,
  Track,
  User,
  Volunteer,
  WhatIfResult,
} from "../domain";
import type { FoodPref } from "../enums";
import type { DomainEvent } from "../events";
import { AGENT_DOMAIN, AgentName, type Actor, type Domain, type Role } from "../identity";
import type { ActionProposal } from "../proposals";
import { diffHashOf, makeProposal } from "./proposals";
import { addMinutesIso, ist, makeFaker, sample, stableId } from "./rng";
import { financeSummary, type EventWorld, type Persona } from "./world";

const NS = "hacknova";
const id = (kind: string, key: string | number) => stableId(`${NS}:${kind}`, key);

export const HACKNOVA_SLUG = "hacknova-2026";
export const HACKNOVA_NOW = ist("2026-10-24", "10:30");
const DAY1 = "2026-10-24";
const DAY2 = "2026-10-25";
const CONSENT_VERSION = "2026-09";

/** Demo persona logins, blueprint Section 11. Emails use the reserved .test domain. */
const PERSONAS = {
  owner: { name: "Vedant", email: "vedant@sutradhar.test", role: "owner" as Role, domains: [] as Domain[] },
  program_lead: {
    name: "Abhinav",
    email: "abhinav@sutradhar.test",
    role: "lead" as Role,
    domains: ["schedule", "speakers", "registrations", "logistics"] as Domain[],
  },
  comms_lead: {
    name: "Thanishka",
    email: "thanishka@sutradhar.test",
    role: "lead" as Role,
    domains: ["comms", "helpdesk", "marketing"] as Domain[],
  },
  faculty: {
    name: "Dr. Srinivasa Rao",
    email: "dr.rao@sutradhar.test",
    role: "faculty_approver" as Role,
    domains: [] as Domain[],
  },
  volunteer: {
    name: "Ravi Kumar",
    email: "ravi@sutradhar.test",
    role: "volunteer" as Role,
    domains: [] as Domain[],
  },
  attendee: {
    name: "Sneha Reddy",
    email: "sneha@sutradhar.test",
    role: "attendee" as Role,
    domains: [] as Domain[],
  },
  sponsor: {
    name: "Acme Cloud",
    email: "partners@acme.test",
    role: "sponsor" as Role,
    domains: [] as Domain[],
  },
  viewer: { name: "Judge", email: "judge@sutradhar.test", role: "viewer" as Role, domains: [] as Domain[] },
} as const;

const COLLEGES = [
  { name: "Deccan Institute of Engineering and Technology", code: "DI", weight: 55 },
  { name: "Golconda Institute of Technology", code: "GT", weight: 12 },
  { name: "Charminar College of Engineering", code: "CC", weight: 11 },
  { name: "Musi Valley Engineering College", code: "MV", weight: 9 },
  { name: "Hussain Sagar Institute of Technology", code: "HS", weight: 8 },
  { name: "Banjara Hills College of Engineering", code: "BH", weight: 5 },
];
const DEPARTMENTS = [
  { name: "CSE", code: "05", weight: 38 },
  { name: "CSE (AI and ML)", code: "66", weight: 16 },
  { name: "CSE (Data Science)", code: "67", weight: 10 },
  { name: "IT", code: "12", weight: 12 },
  { name: "ECE", code: "04", weight: 14 },
  { name: "EEE", code: "02", weight: 6 },
  { name: "Mechanical", code: "03", weight: 4 },
];
const SECTIONS = ["A", "B", "C", "D"];

function weighted<T extends { weight: number }>(f: Faker, items: T[]): T {
  return f.helpers.weightedArrayElement(items.map((i) => ({ weight: i.weight, value: i })));
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.|\.$/g, "");
}

function b64url(s: string): string {
  const b64 = typeof btoa === "function" ? btoa(s) : Buffer.from(s, "utf8").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function buildHackNova(): EventWorld {
  const f = makeFaker(2026);
  const now = HACKNOVA_NOW;
  const orgId = id("org", "deccan");
  const eventId = id("event", "hacknova-2026");
  const createdAt = ist("2026-09-01", "10:00");

  // ---------------------------------------------------------------- people
  const users: User[] = [];
  const memberships: EventMembership[] = [];
  const personas: EventWorld["personas"] = {};
  for (const [key, p] of Object.entries(PERSONAS) as [
    keyof typeof PERSONAS,
    (typeof PERSONAS)[keyof typeof PERSONAS],
  ][]) {
    const userId = id("user", p.email);
    users.push({ id: userId, name: p.name, email: p.email, createdAt });
    memberships.push({
      id: id("membership", p.email),
      orgId,
      eventId,
      userId,
      role: p.role,
      domains: [...p.domains],
    });
    const persona: Persona = { userId, name: p.name, email: p.email, role: p.role };
    personas[key] = persona;
  }
  const owner = personas.owner!;
  const programLead = personas.program_lead!;
  const commsLead = personas.comms_lead!;

  // ---------------------------------------------------------------- event
  const event: Event = {
    id: eventId,
    orgId,
    slug: HACKNOVA_SLUG,
    name: "HackNova 2026",
    type: "tech_fest",
    tagline: "Two days of talks, workshops and a 24-hour hackathon",
    description:
      "HackNova is Deccan Institute's annual tech fest: keynotes, hands-on workshops across AI and ML, Web and Cloud, and Hardware and IoT, and a 24-hour hackathon with 1,05,000 INR in prizes.",
    startsAt: ist(DAY1, "09:00"),
    endsAt: ist(DAY2, "17:00"),
    timezone: "Asia/Kolkata",
    venue: {
      name: "Deccan Institute of Engineering and Technology",
      address: "Main Gate, Gandipet Road",
      city: "Hyderabad",
    },
    capacity: 320,
    status: "live",
    settings: {
      t3MoneyThresholdInr: 10_000,
      broadcastT3Recipients: 200,
      facultyApproverRequired: true,
      autoApproveT1: true,
      quietHours: { startHour: 22, endHour: 7 },
      perPersonHourlyCap: 4,
      registrationTarget: 500,
      odLettersEnabled: true,
      certificatesEnabled: true,
      proposalTtlMinutes: 30,
      // From the Food and Menu document: dinner and midnight snacks are for hackathon teams only.
      mealPlan: [
        { date: "2026-10-24", meal: "breakfast", time: "08:00", audience: "all" },
        { date: "2026-10-24", meal: "lunch", time: "12:30", audience: "all" },
        { date: "2026-10-24", meal: "snacks", time: "16:30", audience: "all" },
        { date: "2026-10-24", meal: "dinner", time: "20:00", audience: "hackathon_teams" },
        { date: "2026-10-25", meal: "breakfast", time: "07:30", audience: "all" },
        { date: "2026-10-25", meal: "lunch", time: "12:30", audience: "all" },
      ],
    },
    brief: {
      name: "HackNova 2026",
      type: "tech_fest",
      dates: [DAY1, DAY2],
      venue: "Deccan Institute of Engineering and Technology, Hyderabad",
      expectedAttendance: 500,
      paid: true,
      ticketPriceInr: 200,
      budgetInr: 300_000,
      tracks: ["AI and ML", "Web and Cloud", "Hardware and IoT"],
      sponsorsExpected: true,
      food: true,
      speakersCount: 12,
      volunteersAvailable: 28,
      attendeeChannels: ["in_app", "email", "telegram", "whatsapp"],
      approvalsNeeded: "Faculty must approve official notices",
    },
    version: 1,
    createdAt,
  };

  // ---------------------------------------------------------------- venue
  const roomDefs = [
    {
      key: "auditorium",
      name: "Main Auditorium",
      building: "Block A",
      kind: "auditorium",
      capacity: 400,
      features: ["projector", "sound", "ac", "wheelchair_access"],
    },
    {
      key: "lab204",
      name: "Lab 204",
      building: "Block B",
      kind: "lab",
      capacity: 60,
      features: ["projector", "power_strips", "lift_access"],
    },
    {
      key: "lab101",
      name: "Lab 101",
      building: "Block B",
      kind: "lab",
      capacity: 80,
      features: ["projector", "power_strips", "kit_counter"],
    },
    {
      key: "sh3",
      name: "Seminar Hall 3",
      building: "Block C",
      kind: "hall",
      capacity: 120,
      features: ["projector", "sound", "ramp_access"],
    },
  ] as const;
  const rooms: Room[] = roomDefs.map((r) => ({
    id: id("room", r.key),
    eventId,
    name: r.name,
    building: r.building,
    kind: r.kind,
    capacity: r.capacity,
    features: [...r.features],
    version: 1,
  }));
  const room = (key: (typeof roomDefs)[number]["key"]) => rooms[roomDefs.findIndex((r) => r.key === key)]!;

  const tracks: Track[] = [
    { id: id("track", "ai"), eventId, name: "AI and ML", description: "Models, retrieval and evaluation" },
    {
      id: id("track", "web"),
      eventId,
      name: "Web and Cloud",
      description: "Building and shipping on the web",
    },
    {
      id: id("track", "iot"),
      eventId,
      name: "Hardware and IoT",
      description: "Boards, sensors and embedded ML",
    },
  ];
  const [trackAi, trackWeb, trackIot] = tracks as [Track, Track, Track];

  // ---------------------------------------------------------------- speakers
  const speakerDefs = [
    { name: "Ananya Iyer", title: "Principal Engineer", org: "Sarvam Labs (fictional)" },
    { name: "Karthik Menon", title: "ML Researcher", org: "Indus AI Research" },
    { name: "Priya Sharma", title: "Staff Engineer", org: "Kaveri Cloud" },
    { name: "Rahul Verma", title: "Founder", org: "Tessel Robotics" },
    { name: "Meera Nair", title: "Security Lead", org: "Orbit Payments" },
    { name: "Arjun Reddy", title: "Developer Advocate", org: "Nimbus Devtools" },
    { name: "Fatima Siddiqui", title: "Embedded Engineer", org: "Godavari Semiconductors" },
    { name: "Vikram Joshi", title: "Engineering Manager", org: "Banyan Analytics" },
    { name: "Lakshmi Prasad", title: "Assistant Professor, CSE", org: "Deccan Institute" },
    { name: "Suresh Babu", title: "Hardware Hacker", org: "Makers Hyderabad" },
    { name: "Divya Kulkarni", title: "Voice AI Engineer", org: "Bhasha Tech" },
    { name: "Imran Khan", title: "CTO", org: "Monsoon Games" },
  ];
  const speakerIds = speakerDefs.map((_, i) => id("speaker", i + 1));
  const sp = (n: number) => speakerIds[n - 1]!;

  // ---------------------------------------------------------------- sessions
  type SessionDef = {
    key: string;
    title: string;
    kind: Session["kind"];
    room: (typeof roomDefs)[number]["key"];
    track?: Track;
    day: string;
    from: string;
    to: string;
    speakers: number[];
    description: string;
  };
  const sessionDefs: SessionDef[] = [
    {
      key: "s01",
      title: "Opening keynote: Building for Bharat",
      kind: "keynote",
      room: "auditorium",
      day: DAY1,
      from: "09:30",
      to: "10:00",
      speakers: [1],
      description: "Why the next billion users change how we design software.",
    },
    {
      key: "s02",
      title: "Hackathon kickoff and problem statements",
      kind: "hackathon",
      room: "auditorium",
      day: DAY1,
      from: "10:00",
      to: "10:30",
      speakers: [],
      description: "Rules, tracks, judging and the 24-hour clock starts.",
    },
    {
      key: "s03",
      title: "Workshop: Fine-tuning small language models",
      kind: "workshop",
      room: "lab204",
      track: trackAi,
      day: DAY1,
      from: "11:00",
      to: "12:30",
      speakers: [2],
      description: "Hands-on LoRA fine-tuning on a laptop GPU.",
    },
    {
      key: "s04",
      title: "Serverless on a student budget",
      kind: "talk",
      room: "lab101",
      track: trackWeb,
      day: DAY1,
      from: "11:00",
      to: "12:00",
      speakers: [3],
      description: "Free tiers, cold starts and what actually costs money.",
    },
    {
      key: "s05",
      title: "ESP32 from zero",
      kind: "talk",
      room: "sh3",
      track: trackIot,
      day: DAY1,
      from: "11:00",
      to: "12:00",
      speakers: [7],
      description: "From blink to WiFi telemetry in one hour.",
    },
    {
      key: "s06",
      title: "Workshop: Retrieval that does not hallucinate",
      kind: "workshop",
      room: "lab204",
      track: trackAi,
      day: DAY1,
      from: "14:00",
      to: "15:30",
      speakers: [8],
      description: "Hybrid search, citations and refusing when unsure.",
    },
    {
      key: "s07",
      title: "Next.js at scale",
      kind: "talk",
      room: "lab101",
      track: trackWeb,
      day: DAY1,
      from: "14:00",
      to: "15:00",
      speakers: [6],
      description: "Caching, streaming and not over-engineering.",
    },
    {
      key: "s08",
      title: "Panel: Hardware startups in India",
      kind: "panel",
      room: "sh3",
      track: trackIot,
      day: DAY1,
      from: "14:00",
      to: "15:00",
      speakers: [4, 10],
      description: "Sourcing, certification and getting to the first 100 units.",
    },
    {
      key: "s09",
      title: "Keynote: Open source careers",
      kind: "keynote",
      room: "auditorium",
      day: DAY1,
      from: "16:00",
      to: "17:00",
      speakers: [12],
      description: "How contributions turn into jobs.",
    },
    {
      key: "s10",
      title: "Evaluating LLM apps",
      kind: "talk",
      room: "sh3",
      track: trackAi,
      day: DAY1,
      from: "17:00",
      to: "18:00",
      speakers: [9],
      description: "Golden sets, graders and regression tests for prompts.",
    },
    {
      key: "s11",
      title: "Workshop: Postgres for app developers",
      kind: "workshop",
      room: "lab101",
      track: trackWeb,
      day: DAY2,
      from: "09:30",
      to: "10:30",
      speakers: [3],
      description: "Indexes, transactions and reading query plans.",
    },
    {
      key: "s12",
      title: "Workshop: Sensors and TinyML",
      kind: "workshop",
      room: "sh3",
      track: trackIot,
      day: DAY2,
      from: "09:30",
      to: "10:30",
      speakers: [10],
      description: "Train a gesture model and run it on a microcontroller.",
    },
    {
      key: "s13",
      title: "Voice AI in Indian languages",
      kind: "talk",
      room: "auditorium",
      track: trackAi,
      day: DAY2,
      from: "10:00",
      to: "11:00",
      speakers: [11],
      description: "Speech recognition for Hindi, Telugu and code-mixed speech.",
    },
    {
      key: "s14",
      title: "Hackathon judging",
      kind: "judging",
      room: "sh3",
      day: DAY2,
      from: "11:30",
      to: "14:30",
      speakers: [2, 5, 9],
      description: "Shortlisted teams present to the judges.",
    },
    // Pre-seeded tension: speaker 5 (Meera Nair) is judging s14 at the same time.
    {
      key: "s15",
      title: "Security for student developers",
      kind: "talk",
      room: "lab101",
      track: trackWeb,
      day: DAY2,
      from: "11:30",
      to: "12:30",
      speakers: [5],
      description: "Secrets, auth and the OWASP top risks in student projects.",
    },
    {
      key: "s16",
      title: "Closing ceremony and prizes",
      kind: "ceremony",
      room: "auditorium",
      day: DAY2,
      from: "16:00",
      to: "17:00",
      speakers: [1],
      description: "Results, prizes and thanks.",
    },
  ];
  const sessionId = (key: string) => id("session", key);

  // ---------------------------------------------------------------- registrations
  const TOTAL_CONFIRMED = 320;
  const TOTAL_WAITLISTED = 40;
  const registrations: Registration[] = [];
  const regStart = new Date(ist("2026-10-01", "09:00")).getTime();
  const regEnd = new Date(ist("2026-10-22", "21:00")).getTime();
  const total = TOTAL_CONFIRMED + TOTAL_WAITLISTED;
  const foodPrefs: { weight: number; value: FoodPref }[] = [
    { weight: 45, value: "veg" },
    { weight: 45, value: "non_veg" },
    { weight: 4, value: "jain" },
    { weight: 3, value: "vegan" },
    { weight: 3, value: "none" },
  ];

  for (let i = 0; i < total; i++) {
    const isSneha = i === 0;
    const college = isSneha ? COLLEGES[0]! : weighted(f, COLLEGES);
    const dept = isSneha ? DEPARTMENTS[0]! : weighted(f, DEPARTMENTS);
    const year = isSneha
      ? 3
      : f.helpers.weightedArrayElement([
          { weight: 22, value: 1 },
          { weight: 30, value: 2 },
          { weight: 30, value: 3 },
          { weight: 18, value: 4 },
        ]);
    const first = isSneha ? "Sneha" : f.person.firstName();
    const last = isSneha ? "Reddy" : f.person.lastName();
    const name = `${first} ${last}`;
    const email = isSneha ? PERSONAS.attendee.email : `${slugify(first)}.${slugify(last)}${i}@example.com`;
    const section = isSneha ? "B" : f.helpers.arrayElement(SECTIONS);
    const entryYear = 27 - year; // year 1 joined in 2026, so roll numbers start with 26
    const rollNo = `${entryYear}${college.code}1A${dept.code}${String(f.number.int({ min: 1, max: 99 })).padStart(2, "0")}`;
    const minor = !isSneha && year === 1 && i % 17 === 0;
    const at =
      regStart + Math.floor(((regEnd - regStart) * i) / total) + f.number.int({ min: 0, max: 50 * 60_000 });
    registrations.push({
      id: id("registration", i),
      eventId,
      userId: isSneha ? personas.attendee!.userId : undefined,
      name,
      email,
      college: college.name,
      department: dept.name,
      year,
      section,
      rollNo: f.datatype.boolean(0.9) || isSneha ? rollNo : undefined,
      status: i < TOTAL_CONFIRMED ? "confirmed" : "waitlisted",
      waitlistPosition: i < TOTAL_CONFIRMED ? undefined : i - TOTAL_CONFIRMED + 1,
      sessionChoices: [],
      foodPref: isSneha ? "veg" : f.helpers.weightedArrayElement(foodPrefs),
      accessibility: !isSneha && i % 41 === 0 ? "Wheelchair user, needs lift access" : undefined,
      adultConfirmed: !minor,
      guardianConsent: minor,
      consentVersion: CONSENT_VERSION,
      createdAt: new Date(at).toISOString(),
      version: 1,
    });
  }

  // A likely duplicate: same person registered twice with a different email.
  const original = registrations[42]!;
  const dup = registrations[150]!;
  dup.name = original.name;
  dup.college = original.college;
  dup.department = original.department;
  dup.year = original.year;
  dup.duplicateOfId = original.id;

  // Session choices, assigned per time slot so nobody picks two overlapping sessions.
  const confirmed = registrations.filter((r) => r.status === "confirmed");
  const assignSlot = (targets: [string, number][]) => {
    const pool = f.helpers.shuffle(confirmed.slice(1));
    // Sneha always chooses the first session of each slot she can, starting with the Lab 204 workshop.
    let cursor = 0;
    for (const [key, count] of targets) {
      const chosen = pool.slice(cursor, cursor + count - (key === targets[0]![0] ? 1 : 0));
      cursor += chosen.length;
      if (key === targets[0]![0]) chosen.push(confirmed[0]!);
      for (const r of chosen) r.sessionChoices.push(sessionId(key));
    }
  };
  assignSlot([["s01", 300]]);
  assignSlot([["s02", 150]]);
  // Pre-seeded tension: 95 people for 60 seats in Lab 204.
  assignSlot([
    ["s03", 95],
    ["s04", 62],
    ["s05", 88],
  ]);
  assignSlot([
    ["s06", 57],
    ["s07", 71],
    ["s08", 104],
  ]);
  assignSlot([["s09", 240]]);
  assignSlot([["s10", 93]]);
  assignSlot([
    ["s13", 160],
    ["s11", 66],
    ["s12", 78],
  ]);
  assignSlot([["s15", 58]]);
  assignSlot([["s16", 290]]);
  for (const r of registrations.filter((x) => x.status === "waitlisted"))
    r.sessionChoices.push(sessionId("s03"));

  const sessions: Session[] = sessionDefs.map((d) => {
    const rm = room(d.room);
    return {
      id: sessionId(d.key),
      eventId,
      trackId: d.track?.id,
      roomId: rm.id,
      title: d.title,
      description: d.description,
      kind: d.kind,
      startsAt: ist(d.day, d.from),
      endsAt: ist(d.day, d.to),
      capacity: rm.capacity,
      registeredCount: confirmed.filter((r) => r.sessionChoices.includes(sessionId(d.key))).length,
      speakerIds: d.speakers.map(sp),
      status:
        new Date(ist(d.day, d.to)).getTime() <= new Date(now).getTime()
          ? "done"
          : new Date(ist(d.day, d.from)).getTime() <= new Date(now).getTime()
            ? "running"
            : "scheduled",
      delayMinutes: 0,
      version: 1,
    };
  });

  const speakers: Speaker[] = speakerDefs.map((s, i) => ({
    id: speakerIds[i]!,
    eventId,
    name: s.name,
    title: s.title,
    organization: s.org,
    bio: `${s.name} is ${s.title} at ${s.org}.`,
    email: `${slugify(s.name)}@speakers.example.com`,
    status: i === 9 ? "tentative" : "confirmed",
    sessionIds: sessions.filter((x) => x.speakerIds.includes(speakerIds[i]!)).map((x) => x.id),
    requirementsSubmitted: i % 4 !== 3,
    version: 1,
  }));

  // Hackathon teams: 30 teams from the first 110 people who chose the kickoff.
  const hackers = confirmed.filter((r) => r.sessionChoices.includes(sessionId("s02"))).slice(0, 110);
  const teams: Team[] = [];
  const teamNames = [
    "Byte Brigade",
    "Null Pointers",
    "Chai and Code",
    "Kernel Panic",
    "Stack Smashers",
    "Quantum Qurries",
    "Deccan Devs",
    "Pixel Pirates",
    "Lambda Lions",
    "Async Avengers",
  ];
  let cursor = 0;
  for (let t = 0; t < 30; t++) {
    const size = 2 + (t % 3) + (t % 5 === 0 ? 0 : 0);
    const members = hackers.slice(cursor, cursor + size);
    cursor += size;
    if (members.length < 2) break;
    const teamId = id("team", t);
    teams.push({
      id: teamId,
      eventId,
      name: `${teamNames[t % teamNames.length]} ${Math.floor(t / teamNames.length) + 1}`,
      memberIds: members.map((m) => m.id),
    });
    for (const m of members) m.teamId = teamId;
  }

  // Tickets for every confirmed registration. Fixture tokens are not really signed; the seed signs real ones.
  const tickets: Ticket[] = confirmed.map((r, i) => {
    const ticketId = id("ticket", i);
    const claims = {
      ticketId,
      registrationId: r.id,
      eventId,
      exp: Math.floor(new Date(ist(DAY2, "23:59")).getTime() / 1000),
    };
    return {
      id: ticketId,
      eventId,
      registrationId: r.id,
      token: `${b64url(JSON.stringify(claims))}.${b64url(`fixture-signature-${ticketId}`)}`,
      issuedAt: r.createdAt,
      expiresAt: ist(DAY2, "23:59"),
      revoked: false,
    };
  });
  const ticketFor = (regId: string) => tickets.find((t) => t.registrationId === regId)!;

  // ---------------------------------------------------------------- volunteers and shifts
  const SKILLS = [
    "registration_desk",
    "av_tech",
    "crowd",
    "first_aid",
    "food",
    "runner",
    "helpdesk",
    "photography",
  ];
  const volunteers: Volunteer[] = [];
  for (let i = 0; i < 28; i++) {
    const isRavi = i === 0;
    const vName = isRavi ? PERSONAS.volunteer.name : f.person.fullName();
    let userId: string;
    if (isRavi) {
      userId = personas.volunteer!.userId;
    } else {
      const email = `${slugify(vName)}.vol${i}@example.com`;
      userId = id("user", email);
      users.push({ id: userId, name: vName, email, createdAt });
      memberships.push({
        id: id("membership", email),
        orgId,
        eventId,
        userId,
        role: "volunteer",
        domains: [],
      });
    }
    const skills = isRavi
      ? ["registration_desk", "helpdesk", "crowd"]
      : sample(f, SKILLS, f.number.int({ min: 1, max: 3 }));
    volunteers.push({
      id: id("volunteer", i),
      eventId,
      userId,
      name: vName,
      phoneMasked: `+91 ******${String(1000 + i * 37).slice(-4)}`,
      skills,
      maxHours: i % 5 === 0 ? 6 : 8,
      hoursServed: 0,
      telegramLinked: i % 3 === 0,
      active: true,
      version: 1,
    });
  }
  // Make sure every needed skill has enough people.
  const ensureSkill = (skill: string, n: number) => {
    const have = volunteers.filter((v) => v.skills.includes(skill));
    for (const v of volunteers.slice(1)) {
      if (have.length >= n) break;
      if (!v.skills.includes(skill)) {
        v.skills.push(skill);
        have.push(v);
      }
    }
  };
  ensureSkill("registration_desk", 6);
  ensureSkill("av_tech", 6);
  ensureSkill("food", 5);
  ensureSkill("first_aid", 3);
  ensureSkill("crowd", 8);
  ensureSkill("helpdesk", 3);
  ensureSkill("runner", 3);
  // Two AV-capable volunteers stay on standby on day 1 (no shift), so a no-show on any AV or
  // lab support shift always has a legal replacement (demo trigger volunteer_noshow, issue #40).
  const standby = new Set(volunteers.slice(-2).map((v) => v.id));
  for (const v of volunteers.slice(-2)) {
    for (const skill of ["av_tech", "crowd"]) if (!v.skills.includes(skill)) v.skills.push(skill);
  }

  type ShiftDef = {
    key: string;
    role: string;
    skill: string;
    room?: (typeof roomDefs)[number]["key"];
    session?: string;
    day: string;
    from: string;
    to: string;
    req: number;
    /** How many to assign in the seed (defaults to req). */
    assign?: number;
  };
  const shiftDefs: ShiftDef[] = [
    {
      key: "reg-d1",
      role: "Registration desk",
      skill: "registration_desk",
      day: DAY1,
      from: "08:00",
      to: "11:00",
      req: 4,
    },
    {
      key: "helpdesk-d1",
      role: "Helpdesk",
      skill: "helpdesk",
      day: DAY1,
      from: "08:00",
      to: "14:00",
      req: 2,
    },
    {
      key: "firstaid-d1a",
      role: "First aid",
      skill: "first_aid",
      day: DAY1,
      from: "08:00",
      to: "14:00",
      req: 1,
    },
    {
      key: "av-aud-d1",
      role: "AV, Main Auditorium",
      skill: "av_tech",
      room: "auditorium",
      day: DAY1,
      from: "09:00",
      to: "13:00",
      req: 2,
    },
    {
      key: "lab204-am",
      role: "Lab support, Lab 204",
      skill: "av_tech",
      room: "lab204",
      session: "s03",
      day: DAY1,
      from: "10:45",
      to: "13:00",
      req: 2,
    },
    {
      key: "lab101-am",
      role: "Lab support, Lab 101",
      skill: "av_tech",
      room: "lab101",
      session: "s04",
      day: DAY1,
      from: "10:45",
      to: "13:00",
      req: 1,
    },
    {
      // speaker_cancel scenario: the keynote's hall shift starts empty, and the crew of the session
      // that fills the keynote slot moves into it (Commander bundle, #53).
      key: "aud-keynote2",
      role: "Hall support, Main Auditorium",
      skill: "crowd",
      room: "auditorium",
      session: "s09",
      day: DAY1,
      from: "15:45",
      to: "17:15",
      req: 2,
      assign: 0,
    },
    {
      key: "sh3-evals",
      role: "Hall support, Seminar Hall 3",
      skill: "crowd",
      room: "sh3",
      session: "s10",
      day: DAY1,
      from: "16:45",
      to: "18:15",
      req: 2,
    },
    {
      key: "sh3-am",
      role: "Hall support, Seminar Hall 3",
      skill: "crowd",
      room: "sh3",
      session: "s05",
      day: DAY1,
      from: "10:45",
      to: "13:00",
      req: 1,
    },
    {
      key: "food-d1",
      role: "Food Court lunch",
      skill: "food",
      day: DAY1,
      from: "12:00",
      to: "14:30",
      req: 4,
    },
    {
      key: "firstaid-d1b",
      role: "First aid",
      skill: "first_aid",
      day: DAY1,
      from: "14:00",
      to: "20:00",
      req: 1,
    },
    {
      key: "labs-pm",
      role: "Lab support, afternoon",
      skill: "crowd",
      day: DAY1,
      from: "14:00",
      to: "18:00",
      req: 3,
    },
    {
      key: "night-d1",
      role: "Hackathon night desk",
      skill: "crowd",
      day: DAY1,
      from: "20:00",
      to: "23:59",
      req: 2,
    },
    {
      key: "reg-d2",
      role: "Registration desk",
      skill: "registration_desk",
      day: DAY2,
      from: "08:00",
      to: "10:30",
      req: 3,
    },
    {
      key: "judging-d2",
      role: "Judging runners",
      skill: "runner",
      room: "sh3",
      session: "s14",
      day: DAY2,
      from: "11:00",
      to: "15:00",
      req: 2,
    },
    {
      key: "closing-d2",
      role: "AV, closing ceremony",
      skill: "av_tech",
      room: "auditorium",
      session: "s16",
      day: DAY2,
      from: "15:30",
      to: "17:30",
      req: 2,
    },
  ];
  const shifts: Shift[] = shiftDefs.map((d) => ({
    id: id("shift", d.key),
    eventId,
    role: d.role,
    roomId: d.room ? room(d.room).id : undefined,
    sessionId: d.session ? sessionId(d.session) : undefined,
    startsAt: ist(d.day, d.from),
    endsAt: ist(d.day, d.to),
    requiredCount: d.req,
    skills: [d.skill],
    version: 1,
  }));

  const hoursPlanned = new Map<string, number>();
  const busy = new Map<string, [number, number][]>();
  const shiftAssignments: ShiftAssignment[] = [];
  const nowMs = new Date(now).getTime();
  shiftDefs.forEach((d, idx) => {
    const s = shifts[idx]!;
    const start = new Date(s.startsAt).getTime();
    const end = new Date(s.endsAt).getTime();
    const hours = (end - start) / 3_600_000;
    const isDay1 = s.startsAt < ist(DAY2, "00:00");
    const candidates = volunteers.filter((v) => {
      if (isDay1 && standby.has(v.id)) return false;
      if (!v.skills.includes(d.skill)) return false;
      if ((hoursPlanned.get(v.id) ?? 0) + hours > v.maxHours) return false;
      return !(busy.get(v.id) ?? []).some(([a, b]) => a < end && start < b);
    });
    // Ravi always takes the day 1 registration desk.
    const ordered =
      d.key === "reg-d1" ? [volunteers[0]!, ...candidates.filter((v) => v !== volunteers[0])] : candidates;
    for (const v of ordered.slice(0, d.assign ?? d.req)) {
      hoursPlanned.set(v.id, (hoursPlanned.get(v.id) ?? 0) + hours);
      busy.set(v.id, [...(busy.get(v.id) ?? []), [start, end]]);
      const started = start <= nowMs;
      shiftAssignments.push({
        id: id("assignment", `${d.key}:${v.id}`),
        shiftId: s.id,
        volunteerId: v.id,
        status: end <= nowMs ? "done" : started ? "checked_in" : "assigned",
        checkedInAt: started ? addMinutesIso(s.startsAt, -5) : undefined,
        version: 1,
      });
      if (started) v.hoursServed += Math.round(((Math.min(end, nowMs) - start) / 3_600_000) * 10) / 10;
    }
  });

  // Availability windows. Most volunteers are around both days; every 7th is only free on day 1,
  // around the shifts they already hold, so the crew solver has a real constraint to respect.
  const availability: Availability[] = [];
  volunteers.forEach((v, i) => {
    const mine = shiftAssignments
      .filter((a) => a.volunteerId === v.id)
      .map((a) => shifts.find((s) => s.id === a.shiftId)!);
    const allDay1 = mine.every((s) => s.startsAt < ist(DAY2, "00:00"));
    if (i > 0 && i % 7 === 0 && mine.length > 0 && allDay1) {
      const start = mine.map((s) => s.startsAt).sort()[0]!;
      const end = mine
        .map((s) => s.endsAt)
        .sort()
        .at(-1)!;
      availability.push({
        id: id("availability", `${v.id}:d1`),
        eventId,
        volunteerId: v.id,
        start: addMinutesIso(start, -30),
        end: addMinutesIso(end, 30),
      });
      return;
    }
    availability.push({
      id: id("availability", `${v.id}:d1`),
      eventId,
      volunteerId: v.id,
      start: ist(DAY1, "07:30"),
      end: ist(DAY1, "23:59"),
    });
    availability.push({
      id: id("availability", `${v.id}:d2`),
      eventId,
      volunteerId: v.id,
      start: ist(DAY2, "07:30"),
      end: ist(DAY2, "18:00"),
    });
  });

  // ---------------------------------------------------------------- check-ins so far (day 1, until 10:30)
  const deskVolunteers = shiftAssignments
    .filter((a) => a.shiftId === id("shift", "reg-d1"))
    .map((a) => volunteers.find((v) => v.id === a.volunteerId)!);
  const checkins: Checkin[] = [];
  const toCheckIn = [confirmed[0]!, ...f.helpers.shuffle(confirmed.slice(1)).slice(0, 213)];
  const openMs = new Date(ist(DAY1, "08:30")).getTime();
  toCheckIn.forEach((r, i) => {
    const scanner = i === 0 ? volunteers[0]! : deskVolunteers[i % deskVolunteers.length]!;
    // Arrivals bunch up between 09:00 and 09:40.
    const offsetMin =
      i === 0
        ? 42
        : Math.min(
            118,
            Math.max(
              0,
              Math.round(
                f.number.float({ min: 0, max: 1 }) ** 0.7 * 70 + f.number.int({ min: -20, max: 48 }),
              ),
            ),
          );
    const at = new Date(openMs + offsetMin * 60_000 + f.number.int({ min: 0, max: 59 }) * 1000).toISOString();
    const t = ticketFor(r.id);
    const checkinId = id("checkin", i);
    checkins.push({
      id: checkinId,
      eventId,
      ticketId: t.id,
      registrationId: r.id,
      scannerUserId: scanner.userId!,
      scannerName: scanner.name,
      clientId: `desk-${scanner.id.slice(0, 4)}-${i}`,
      deviceTime: at,
      serverTime: at,
      duplicate: false,
    });
    r.checkedInAt = at;
  });
  // A shared screenshot scanned a second time: first scan wins, second is flagged.
  const firstScan = checkins[7]!;
  checkins.push({
    ...firstScan,
    id: id("checkin", "dup-1"),
    clientId: `desk-dup-1`,
    scannerUserId: deskVolunteers[1]!.userId!,
    scannerName: deskVolunteers[1]!.name,
    deviceTime: addMinutesIso(firstScan.serverTime, 26),
    serverTime: addMinutesIso(firstScan.serverTime, 26),
    duplicate: true,
    originalCheckinId: firstScan.id,
  });

  // ---------------------------------------------------------------- knowledge base and helpdesk
  const kbDocuments: KbDocument[] = [
    {
      id: "kb-rulebook",
      eventId,
      title: "HackNova 2026 Rulebook",
      kind: "rulebook",
      mimeType: "text/markdown",
      version: 1,
      status: "ready",
      public: true,
      chunkCount: 14,
      updatedAt: ist("2026-10-10", "12:00"),
    },
    {
      id: "kb-faq",
      eventId,
      title: "HackNova 2026 FAQ",
      kind: "faq",
      mimeType: "text/markdown",
      version: 1,
      status: "ready",
      public: true,
      chunkCount: 17,
      updatedAt: ist("2026-10-18", "18:00"),
    },
    {
      id: "kb-venue",
      eventId,
      title: "Venue Notes",
      kind: "venue",
      mimeType: "text/markdown",
      version: 1,
      status: "ready",
      public: true,
      chunkCount: 8,
      updatedAt: ist("2026-10-15", "11:00"),
    },
    {
      id: "kb-menu",
      eventId,
      title: "Food and Menu",
      kind: "menu",
      mimeType: "text/markdown",
      version: 1,
      status: "ready",
      public: true,
      chunkCount: 6,
      updatedAt: ist("2026-10-20", "16:00"),
    },
  ];

  const sneha = confirmed[0]!;
  const convSneha: Conversation = {
    id: id("conversation", "sneha"),
    eventId,
    channel: "in_app",
    userId: sneha.userId,
    askerRole: "attendee",
    status: "open",
    createdAt: ist(DAY1, "09:50"),
  };
  const conversations: Conversation[] = [convSneha];
  const messages: Message[] = [
    {
      id: id("message", "sneha-1"),
      conversationId: convSneha.id,
      role: "user",
      body: "Do I get an OD letter for attending?",
      citations: [],
      guard: "allow",
      at: ist(DAY1, "09:50"),
    },
    {
      id: id("message", "sneha-2"),
      conversationId: convSneha.id,
      role: "assistant",
      body: "Yes. Deccan Institute students get On Duty attendance through their department, and the OD list goes to HODs by 28 October.",
      citations: [{ ref: "kb:kb-faq#do-i-get-an-od-letter", label: "FAQ: Do I get an OD letter?" }],
      guard: "allow",
      at: ist(DAY1, "09:50"),
    },
  ];
  const lunchAsks = ["Where is lunch today?", "lunch kahan milega?", "What time is lunch and where?"];
  lunchAsks.forEach((q, i) => {
    const r = confirmed[20 + i]!;
    const c: Conversation = {
      id: id("conversation", `lunch-${i}`),
      eventId,
      channel: i === 1 ? "telegram" : "in_app",
      userId: undefined,
      askerRole: "attendee",
      status: "closed",
      createdAt: addMinutesIso(now, -8 + i * 2),
    };
    conversations.push(c);
    messages.push({
      id: id("message", `lunch-${i}-q`),
      conversationId: c.id,
      role: "user",
      body: q,
      citations: [],
      guard: "allow",
      at: addMinutesIso(now, -8 + i * 2),
    });
    messages.push({
      id: id("message", `lunch-${i}-a`),
      conversationId: c.id,
      role: "assistant",
      body: "Lunch is served from 12:30 to 14:00 at the Food Court in Block D.",
      citations: [{ ref: "kb:kb-menu#day-1-saturday-24-october", label: "Menu: Day 1" }],
      guard: "allow",
      at: addMinutesIso(now, -8 + i * 2),
    });
    void r;
  });
  const convKit: Conversation = {
    id: id("conversation", "kit"),
    eventId,
    channel: "in_app",
    askerRole: "attendee",
    status: "escalated",
    createdAt: ist(DAY1, "10:05"),
  };
  conversations.push(convKit);
  const escalations: Escalation[] = [
    {
      id: id("escalation", "kit"),
      eventId,
      conversationId: convKit.id,
      summary:
        "Attendee asks whether they can bring their own Raspberry Pi kit into the Web and Cloud track.",
      suggestedReply:
        "Yes, you can bring your own hardware. Please register it at the Lab 101 kit counter so it is not mixed up with the shared kits.",
      priority: "normal",
      status: "open",
      createdAt: ist(DAY1, "10:05"),
    },
  ];
  messages.push({
    id: id("message", "kit-q"),
    conversationId: convKit.id,
    role: "user",
    body: "Can I bring my own Raspberry Pi for the web track?",
    citations: [],
    guard: "allow",
    at: ist(DAY1, "10:05"),
  });
  messages.push({
    id: id("message", "kit-a"),
    conversationId: convKit.id,
    role: "assistant",
    body: "I'm not sure about that, I've passed it to the team.",
    citations: [],
    guard: "allow",
    escalationId: escalations[0]!.id,
    at: ist(DAY1, "10:05"),
  });

  const announcements: Announcement[] = [
    {
      id: id("announcement", "welcome"),
      eventId,
      title: "Welcome to HackNova 2026",
      body: "Welcome! Check-in is open at the main gate until 10:00. The opening keynote starts at 09:30 in the Main Auditorium.",
      bodyByChannel: {
        in_app:
          "Welcome! Check-in is open at the main gate until 10:00. The opening keynote starts at 09:30 in the Main Auditorium.",
        email:
          "Welcome to HackNova 2026. Check-in is open at the main gate until 10:00, and the opening keynote starts at 09:30 in the Main Auditorium. Keep your ticket QR ready.",
        telegram:
          "Welcome to HackNova 2026! Check-in at the main gate until 10:00. Keynote 09:30, Main Auditorium.",
      },
      segment: { type: "all" },
      channels: ["in_app", "email", "telegram"],
      category: "info",
      public: true,
      status: "sent",
      sentAt: ist(DAY1, "08:00"),
      recipientCount: 320,
      approvedByRole: "lead",
      draftedBy: "herald",
    },
    {
      id: id("announcement", "wifi"),
      eventId,
      title: "WiFi details",
      body: "Connect to HackNova-Guest. The password is on the back of your badge.",
      bodyByChannel: { in_app: "Connect to HackNova-Guest. The password is on the back of your badge." },
      segment: { type: "all" },
      channels: ["in_app"],
      category: "info",
      public: true,
      status: "sent",
      sentAt: ist(DAY1, "09:00"),
      recipientCount: 320,
      approvedByRole: "lead",
      draftedBy: "herald",
    },
  ];

  const tasks: Task[] = [
    {
      id: id("task", "water"),
      eventId,
      title: "Refill water cans on Block B second floor",
      assigneeVolunteerId: volunteers[5]!.id,
      roomId: room("lab204").id,
      status: "open",
      priority: "normal",
      dueAt: ist(DAY1, "11:00"),
      createdAt: ist(DAY1, "10:10"),
      version: 1,
    },
    {
      id: id("task", "signage"),
      eventId,
      title: "Put up Food Court direction signs at Block B exit",
      assigneeVolunteerId: volunteers[9]!.id,
      status: "in_progress",
      priority: "normal",
      dueAt: ist(DAY1, "12:15"),
      createdAt: ist(DAY1, "10:15"),
      version: 1,
    },
    {
      id: id("task", "kits"),
      eventId,
      title: "Count hardware kits at the Lab 101 counter",
      status: "done",
      priority: "low",
      createdAt: ist(DAY1, "08:30"),
      version: 2,
    },
  ];

  const incidents: Incident[] = [
    {
      id: id("incident", "wifi"),
      eventId,
      title: "WiFi slow at the registration desk",
      category: "it",
      severity: "low",
      status: "resolved",
      source: "crew_report",
      description: "Scanners were slow to sync; switched the desk router to the wired uplink.",
      emergency: false,
      reportedByUserId: personas.volunteer!.userId,
      createdAt: ist(DAY1, "08:48"),
      resolvedAt: ist(DAY1, "09:05"),
      version: 2,
    },
    {
      id: id("incident", "queue"),
      eventId,
      title: "Queue at the registration desk crossed 40 people",
      category: "queue",
      severity: "medium",
      status: "acknowledged",
      source: "radar",
      description: "Check-ins peaked at 38 per 5 minutes between 09:10 and 09:30.",
      emergency: false,
      createdAt: ist(DAY1, "09:22"),
      version: 1,
    },
  ];

  // ---------------------------------------------------------------- planning
  const ms = (
    key: string,
    title: string,
    domain: Domain,
    dueOn: string,
    status: Milestone["status"],
    ownerRole: Role,
    critical = false,
    dependsOn: string[] = [],
  ): Milestone => ({
    id: id("milestone", key),
    eventId,
    title,
    domain,
    dueOn,
    status,
    ownerRole,
    dependsOn: dependsOn.map((k) => id("milestone", k)),
    critical,
    completedAt: status === "done" ? ist(dueOn, "17:00") : undefined,
    version: 1,
  });
  const milestones: Milestone[] = [
    ms("venue", "Confirm venue and rooms", "planning", "2026-09-10", "done", "owner", true),
    ms("budget", "Approve budget split", "finance", "2026-09-12", "done", "owner", true),
    ms("speakers", "Confirm all speakers", "speakers", "2026-10-05", "done", "lead", true, ["venue"]),
    ms("reg-open", "Open registrations", "registrations", "2026-10-01", "done", "lead", true),
    ms("sponsors", "Close sponsor commitments", "sponsorship", "2026-10-15", "in_progress", "lead"),
    ms("volunteers", "Volunteer shifts published", "crew", "2026-10-20", "done", "lead", false, ["speakers"]),
    ms("badges", "Print badges and lanyards", "logistics", "2026-10-22", "done", "lead"),
    ms(
      "food-final",
      "Send final food count to caterer",
      "logistics",
      "2026-10-23",
      "in_progress",
      "lead",
      true,
    ),
    ms("judge-pack", "Judge briefing pack ready", "schedule", "2026-10-25", "not_started", "lead"),
    ms("od", "Send OD list to HODs", "post_event", "2026-10-28", "not_started", "lead", true),
    ms("certs", "Email participation certificates", "post_event", "2026-10-31", "not_started", "lead"),
    ms("settlement", "Settle vendor payments", "finance", "2026-11-05", "not_started", "owner"),
  ];

  // ---------------------------------------------------------------- finance
  const cat = (key: string, name: string, capInr: number): BudgetCategory => ({
    id: id("budget", key),
    eventId,
    key,
    name,
    capInr,
    version: 1,
  });
  const budgetCategories: BudgetCategory[] = [
    cat("venue_av", "Venue and AV", 50_000),
    cat("catering", "Catering", 100_000),
    cat("marketing", "Marketing", 25_000),
    cat("prizes", "Prizes", 105_000),
    cat("swag", "Badges and swag", 10_000),
    cat("contingency", "Contingency", 10_000),
  ];
  const catId = (key: string) => id("budget", key);
  const le = (key: string, e: Omit<LedgerEntry, "id" | "eventId" | "createdAt">): LedgerEntry => ({
    id: id("ledger", key),
    eventId,
    createdAt: ist(e.occurredOn, "12:00"),
    ...e,
  });
  const ledgerEntries: LedgerEntry[] = [
    le("cater-adv", {
      type: "expense",
      categoryId: catId("catering"),
      amountInr: 60_000,
      status: "paid",
      vendor: "Annapurna Caterers",
      note: "Advance for both days",
      occurredOn: "2026-10-12",
    }),
    le("cater-bal", {
      type: "expense",
      categoryId: catId("catering"),
      amountInr: 32_000,
      status: "committed",
      vendor: "Annapurna Caterers",
      note: "Day 1 dinner and midnight snacks for hackathon",
      occurredOn: "2026-10-20",
    }),
    le("sound", {
      type: "expense",
      categoryId: catId("venue_av"),
      amountInr: 18_000,
      status: "paid",
      vendor: "Sri Sai Sound and Lights",
      note: "Auditorium sound for two days",
      occurredOn: "2026-10-15",
    }),
    le("posters", {
      type: "expense",
      categoryId: catId("marketing"),
      amountInr: 4_500,
      status: "paid",
      vendor: "Print Hub Gandipet",
      note: "A2 posters for 6 colleges",
      occurredOn: "2026-10-03",
    }),
    le("insta-ads", {
      type: "expense",
      categoryId: catId("marketing"),
      amountInr: 3_000,
      status: "paid",
      note: "Instagram promotion, one week",
      occurredOn: "2026-10-08",
    }),
    le("badges", {
      type: "expense",
      categoryId: catId("swag"),
      amountInr: 2_500,
      status: "paid",
      vendor: "Print Hub Gandipet",
      note: "400 badges and lanyards",
      occurredOn: "2026-10-21",
    }),
    le("grant", {
      type: "income",
      source: "college",
      amountInr: 100_000,
      status: "received",
      note: "Deccan Institute student activities grant",
      occurredOn: "2026-09-15",
    }),
    le("fees", {
      type: "income",
      source: "registration_fee",
      amountInr: 22_000,
      status: "received",
      note: "Hackathon fees, 110 participants at 200 INR",
      occurredOn: "2026-10-22",
    }),
    le("acme", {
      type: "income",
      source: "sponsor",
      sponsorId: id("sponsor", "acme"),
      amountInr: 50_000,
      status: "due",
      note: "Acme Cloud gold sponsorship",
      occurredOn: "2026-10-18",
    }),
  ];
  const quotes: Quote[] = [
    {
      id: id("quote", "catering"),
      eventId,
      title: "Catering quotes for two days",
      categoryId: catId("catering"),
      rows: [
        { vendor: "Annapurna Caterers", amountInr: 92_000, items: "All meals, 350 plates per meal" },
        { vendor: "Bawarchi Events", amountInr: 1_04_000, items: "All meals, includes dessert every meal" },
        { vendor: "Campus Canteen", amountInr: 78_000, items: "Lunch and snacks only, no dinner" },
      ],
      recommendedVendor: "Annapurna Caterers",
      createdAt: ist("2026-10-05", "15:00"),
    },
  ];

  // ---------------------------------------------------------------- sponsors and marketing
  const sponsorProspects: SponsorProspect[] = [
    {
      id: id("sponsor", "acme"),
      eventId,
      name: "Acme Cloud",
      stage: "confirmed",
      tier: "gold",
      fitReason: "Student cloud credits programme; hiring interns in Hyderabad",
      contactName: "Rohan Mehta",
      askInr: 50_000,
      committedInr: 50_000,
      lastTouchAt: ist("2026-10-18", "11:00"),
      deliverables: [
        {
          id: id("deliverable", "acme-logo"),
          title: "Logo on stage banner",
          status: "done",
          dueOn: "2026-10-22",
        },
        {
          id: id("deliverable", "acme-stall"),
          title: "Stall near the Food Court",
          status: "in_progress",
          dueOn: DAY1,
        },
        {
          id: id("deliverable", "acme-social"),
          title: "Two social media shoutouts",
          status: "pending",
          dueOn: DAY2,
        },
      ],
      version: 3,
    },
    {
      id: id("sponsor", "nimbus"),
      eventId,
      name: "Nimbus Devtools",
      stage: "negotiating",
      tier: "silver",
      fitReason: "Developer tools company with a campus ambassador programme",
      contactName: "Arjun Reddy",
      askInr: 25_000,
      lastTouchAt: ist("2026-10-21", "16:00"),
      nextFollowUpAt: ist(DAY1, "15:00"),
      deliverables: [],
      version: 2,
    },
    {
      id: id("sponsor", "tessel"),
      eventId,
      name: "Tessel Robotics",
      stage: "replied",
      tier: "in_kind",
      fitReason: "Can provide ESP32 kits for the hardware track",
      askInr: 15_000,
      lastTouchAt: ist("2026-10-19", "10:00"),
      nextFollowUpAt: ist("2026-10-23", "10:00"),
      deliverables: [],
      version: 2,
    },
    {
      id: id("sponsor", "orbit"),
      eventId,
      name: "Orbit Payments",
      stage: "contacted",
      tier: "partner",
      fitReason: "Fintech hiring security interns",
      askInr: 20_000,
      lastTouchAt: ist("2026-10-16", "12:00"),
      nextFollowUpAt: ist("2026-10-23", "12:00"),
      deliverables: [],
      version: 1,
    },
    {
      id: id("sponsor", "banyan"),
      eventId,
      name: "Banyan Analytics",
      stage: "prospect",
      fitReason: "Data science team sponsored two college fests last year",
      askInr: 20_000,
      deliverables: [],
      version: 1,
    },
    {
      id: id("sponsor", "monsoon"),
      eventId,
      name: "Monsoon Games",
      stage: "declined",
      fitReason: "Game studio; budget already spent this quarter",
      askInr: 15_000,
      lastTouchAt: ist("2026-10-12", "17:00"),
      deliverables: [],
      version: 2,
    },
  ];

  const funnel: FunnelSnapshot[] = [];
  for (let d = 1; d <= 23; d++) {
    const date = `2026-10-${String(d).padStart(2, "0")}`;
    const endOfDay = new Date(ist(date, "23:59")).getTime();
    funnel.push({
      date,
      registrations: confirmed.filter((r) => new Date(r.createdAt).getTime() <= endOfDay).length,
      target: Math.round((500 * d) / 23),
    });
  }
  const marketingPosts: MarketingPost[] = [
    {
      id: id("post", "launch-ig"),
      eventId,
      platform: "instagram",
      body: "HackNova 2026 is here. Two days, three tracks, one 24-hour hackathon. Register now, link in bio.",
      hashtags: ["HackNova2026", "Hyderabad", "hackathon"],
      status: "posted",
      scheduledFor: ist("2026-10-01", "18:00"),
      postedAt: ist("2026-10-01", "18:02"),
    },
    {
      id: id("post", "launch-li"),
      eventId,
      platform: "linkedin",
      body: "We are opening registrations for HackNova 2026 at Deccan Institute: keynotes, hands-on workshops and a 24-hour hackathon with 1,05,000 INR in prizes.",
      hashtags: ["HackNova2026"],
      status: "posted",
      scheduledFor: ist("2026-10-02", "10:00"),
      postedAt: ist("2026-10-02", "10:05"),
    },
    {
      id: id("post", "speakers-ig"),
      eventId,
      platform: "instagram",
      body: "Meet our speakers: 12 builders from startups, labs and classrooms.",
      hashtags: ["HackNova2026"],
      status: "posted",
      scheduledFor: ist("2026-10-10", "18:00"),
      postedAt: ist("2026-10-10", "18:01"),
    },
    {
      id: id("post", "wa-forward"),
      eventId,
      platform: "whatsapp",
      body: "HackNova 2026, 24 and 25 Oct at Deccan Institute. Free talks and workshops, 24h hackathon. Register: hacknova.example",
      hashtags: [],
      status: "approved",
      scheduledFor: ist("2026-10-20", "19:00"),
    },
    {
      id: id("post", "day1-ig"),
      eventId,
      platform: "instagram",
      body: "Day 1 is live! Keynote at 09:30, workshops from 11:00.",
      hashtags: ["HackNova2026"],
      status: "draft",
      scheduledFor: ist(DAY1, "11:00"),
    },
    {
      id: id("post", "poster-final"),
      eventId,
      platform: "poster",
      body: "Final call poster for the closing ceremony.",
      hashtags: [],
      status: "draft",
    },
  ];

  // ---------------------------------------------------------------- logistics
  const checklists: Checklist[] = rooms.map((r) => ({
    id: id("checklist", r.id),
    eventId,
    title: `${r.name} readiness`,
    scope: { type: "room", ref: r.id },
    items: [
      { id: id("checklist-item", `${r.id}:projector`), label: "Projector and HDMI tested", status: "done" },
      {
        id: id("checklist-item", `${r.id}:mic`),
        label: "Mic and speakers tested",
        status: r.kind === "lab" ? "todo" : "done",
      },
      { id: id("checklist-item", `${r.id}:seating`), label: `Seating for ${r.capacity}`, status: "done" },
      {
        id: id("checklist-item", `${r.id}:signage`),
        label: "Room signage at the door",
        status: r.name === "Lab 204" ? "in_progress" : "done",
      },
    ],
    version: 1,
  }));
  checklists.push({
    id: id("checklist", "catering"),
    eventId,
    title: "Catering, Annapurna Caterers",
    scope: { type: "vendor", ref: "Annapurna Caterers" },
    items: [
      {
        id: id("checklist-item", "cater:count"),
        label: "Final plate count shared",
        status: "in_progress",
        notes: "Waiting on day 2 numbers",
      },
      { id: id("checklist-item", "cater:jain"), label: "Jain meals labelled separately", status: "done" },
      { id: id("checklist-item", "cater:allergen"), label: "Allergen cards at the counter", status: "todo" },
    ],
    version: 1,
  });
  const inventory: InventoryItem[] = [
    { id: id("inventory", "badges"), eventId, name: "Badges", count: 400, unit: "pcs" },
    { id: id("inventory", "lanyards"), eventId, name: "Lanyards", count: 400, unit: "pcs" },
    { id: id("inventory", "tshirts"), eventId, name: "Volunteer T-shirts", count: 32, unit: "pcs" },
    { id: id("inventory", "kits"), eventId, name: "ESP32 hardware kits", count: 25, unit: "kits" },
    { id: id("inventory", "water"), eventId, name: "Water cans (20 L)", count: 40, unit: "cans" },
  ];

  // ---------------------------------------------------------------- agents
  const leadFor: Record<Domain, { role: Role; userId?: string; name?: string }> = {
    planning: { role: "owner", userId: owner.userId, name: owner.name },
    finance: { role: "owner", userId: owner.userId, name: owner.name },
    sponsorship: { role: "owner", userId: owner.userId, name: owner.name },
    marketing: { role: "lead", userId: commsLead.userId, name: commsLead.name },
    registrations: { role: "lead", userId: programLead.userId, name: programLead.name },
    schedule: { role: "lead", userId: programLead.userId, name: programLead.name },
    speakers: { role: "lead", userId: programLead.userId, name: programLead.name },
    crew: { role: "organizer" },
    logistics: { role: "lead", userId: programLead.userId, name: programLead.name },
    comms: { role: "lead", userId: commsLead.userId, name: commsLead.name },
    helpdesk: { role: "lead", userId: commsLead.userId, name: commsLead.name },
    ops: { role: "owner", userId: owner.userId, name: owner.name },
    post_event: { role: "owner", userId: owner.userId, name: owner.name },
  };
  const SMART: AgentName[] = ["commander", "scheduler", "chronicler", "finance"];
  const mandates: Record<AgentName, string> = {
    commander: "Runs the plan, wakes the right agents and resolves conflicts",
    planner: "Keeps milestones on track and flags anything overdue",
    finance: "Tracks the 3 lakh budget and warns before overspend",
    sponsorship: "Follows up with sponsors and tracks deliverables",
    marketing: "Pushes registrations toward the 500 target",
    registrar: "Handles capacity, waitlist and duplicates",
    scheduler: "Keeps the schedule clash free and replans on changes",
    speaker_liaison: "Confirms speakers and collects their requirements",
    crew_chief: "Staffs every shift fairly and covers no-shows",
    logistics: "Rooms, food counts and inventory",
    herald: "Drafts every announcement for approval",
    helpdesk: "Answers attendee questions with citations",
    radar: "Watches check-ins, queues and question spikes",
    chronicler: "Report, certificates and OD lists after the event",
  };

  const actorOf = (agent: AgentName, runId: string): Actor => ({ kind: "agent", agent, runId, eventId });
  const runs: AgentRun[] = [];
  const steps: AgentStep[] = [];
  const addRun = (
    agent: AgentName,
    key: string,
    startedAt: string,
    opts: {
      status?: AgentRun["status"];
      trigger?: AgentRun["trigger"];
      proposalIds?: string[];
      tokens?: [number, number];
      costUsd?: number;
      model?: string;
      provider?: "groq" | "bedrock" | "ollama";
      tools?: string[];
    } = {},
  ) => {
    const runId = id("run", key);
    const tier = SMART.includes(agent) ? "smart" : "fast";
    const [inTok, outTok] = opts.tokens ?? [1800, 320];
    const latency = 1200 + (inTok % 900);
    let index = 0;
    for (const tool of opts.tools ?? []) {
      steps.push({
        id: id("step", `${key}:${index}`),
        runId,
        index,
        at: addMinutesIso(startedAt, 0),
        kind: "tool",
        tool,
        input: { eventId },
        output: { ok: true },
        ok: true,
        latencyMs: 40 + index * 7,
      });
      index++;
    }
    steps.push({
      id: id("step", `${key}:${index}`),
      runId,
      index,
      at: startedAt,
      kind: "llm",
      tier,
      provider: opts.provider ?? "groq",
      model: opts.model ?? (tier === "smart" ? "openai/gpt-oss-120b" : "openai/gpt-oss-20b"),
      ok: true,
      inputTokens: inTok,
      outputTokens: outTok,
      latencyMs: latency,
      costUsd: opts.costUsd ?? 0.0006,
    });
    index++;
    for (const pid of opts.proposalIds ?? []) {
      steps.push({
        id: id("step", `${key}:${index}`),
        runId,
        index,
        at: startedAt,
        kind: "propose",
        actionKind: "incident.create",
        proposalId: pid,
        result: "created",
        status: "pending",
      });
      index++;
    }
    runs.push({
      id: runId,
      eventId,
      agent,
      trigger: opts.trigger ?? { type: "schedule", ref: "tick" },
      status: opts.status ?? "succeeded",
      simulation: false,
      modelTier: tier,
      startedAt,
      finishedAt: addMinutesIso(startedAt, 1),
      stepCount: index,
      proposalIds: opts.proposalIds ?? [],
      inputTokens: inTok,
      outputTokens: outTok,
      costUsd: opts.costUsd ?? 0.0006,
      latencyMs: latency,
    });
    return { runId, actor: actorOf(agent, runId) };
  };

  // ---------------------------------------------------------------- proposals
  const proposals: ActionProposal[] = [];
  const lab204 = room("lab204");
  const auditorium = room("auditorium");
  const s03 = sessions.find((s) => s.id === sessionId("s03"))!;

  const schedRun = addRun("scheduler", "sched-lab204", ist(DAY1, "10:12"), {
    trigger: { type: "domain_event", eventType: "registration.checked_in" },
    tools: ["sessions.list", "rooms.list", "registrations.stats"],
    tokens: [4200, 610],
    costUsd: 0.0021,
  });
  const moveRoom = makeProposal({
    kind: "schedule.change_room",
    eventId,
    proposedBy: schedRun.actor,
    domain: "schedule",
    riskTier: "T2",
    createdAt: ist(DAY1, "10:13"),
    summary: "Move the fine-tuning workshop from Lab 204 to the Main Auditorium",
    rationale: `95 people registered for 60 seats in Lab 204. The Main Auditorium is free from 11:00 to 12:30 and seats 400. The solver found no speaker or attendee clash.`,
    evidence: [
      { type: "row", ref: `sessions/${s03.id}`, label: "Fine-tuning workshop: 95 registered" },
      { type: "row", ref: `rooms/${lab204.id}`, label: "Lab 204: 60 seats" },
    ],
    payload: { sessionId: s03.id, newRoomId: auditorium.id, reason: "Registrations exceed Lab 204 capacity" },
    impact: {
      people: 96,
      attendees: 95,
      volunteers: 2,
      sessions: 1,
      channels: ["in_app", "email", "telegram"],
      reversible: true,
    },
    diff: [
      {
        entity: "sessions",
        id: s03.id,
        before: { roomId: lab204.id, capacity: 60 },
        after: { roomId: auditorium.id, capacity: 400 },
      },
    ],
    tierReasons: ["Changes a session with 95 attendees", "People-facing change"],
    preconditions: [{ entity: "sessions", id: s03.id, version: 1 }],
  });
  proposals.push(moveRoom);
  runs.find((r) => r.id === schedRun.runId)!.proposalIds.push(moveRoom.id);

  const heraldRun = addRun("herald", "herald-official", ist(DAY1, "10:20"), {
    trigger: { type: "command", ref: "organizer" },
    tokens: [2600, 540],
    costUsd: 0.0009,
  });
  const officialBody =
    "Official notice: the hackathon submission portal closes at 10:00 IST on 25 October. Late submissions will not be accepted.";
  const official = makeProposal({
    kind: "comms.send_announcement",
    eventId,
    proposedBy: heraldRun.actor,
    domain: "comms",
    riskTier: "T3",
    createdAt: ist(DAY1, "10:21"),
    summary: "Official notice to all attendees: submission deadline",
    rationale:
      "Organizer asked for an official reminder of the submission deadline. Official notices need faculty approval for this event.",
    evidence: [
      { type: "kb", ref: "kb:kb-rulebook#hackathon-timeline", label: "Rulebook: Hackathon timeline" },
    ],
    payload: {
      title: "Submission deadline",
      segment: { type: "all" },
      channels: ["in_app", "email", "telegram", "whatsapp"],
      bodyByChannel: {
        in_app: officialBody,
        email: officialBody,
        telegram: officialBody,
        whatsapp: officialBody,
      },
      category: "official",
      public: true,
    },
    impact: {
      people: 320,
      attendees: 320,
      volunteers: 0,
      sessions: 0,
      channels: ["in_app", "email", "telegram", "whatsapp"],
      reversible: false,
    },
    diff: [
      {
        entity: "announcements",
        id: null,
        before: null,
        after: { title: "Submission deadline", category: "official", recipients: 320 },
      },
    ],
    tierReasons: [
      "Official category",
      "Broadcast to 320 people (over 200)",
      "Faculty approval required for this event",
    ],
    facultyApprovalRequired: true,
    approvals: [],
  });
  // One of the two approvals is already in, from the comms lead.
  official.approvals.push({
    userId: commsLead.userId,
    role: "lead",
    at: ist(DAY1, "10:24"),
    diffHash: official.diffHash,
  });
  proposals.push(official);
  runs.find((r) => r.id === heraldRun.runId)!.proposalIds.push(official.id);

  const finRun = addRun("finance", "fin-snacks", ist(DAY1, "10:25"), {
    trigger: { type: "command", ref: "organizer" },
    tools: ["finance.budget", "finance.ledger"],
    tokens: [2100, 380],
    costUsd: 0.0012,
    provider: "bedrock",
    model: "global.amazon.nova-2-lite-v1:0",
  });
  const expense = makeProposal({
    kind: "finance.expense.record",
    eventId,
    proposedBy: finRun.actor,
    domain: "finance",
    riskTier: "T2",
    createdAt: ist(DAY1, "10:26"),
    summary: "Record 8,000 INR for extra evening snacks (catering reaches 100%)",
    rationale:
      "Caterer quoted 8,000 INR for 150 extra snack packs for the hackathon night. This takes catering from 92% to 100% of its cap.",
    evidence: [{ type: "metric", ref: "budget.catering.used", label: "Catering at 92%" }],
    payload: {
      categoryId: catId("catering"),
      amountInr: 8_000,
      vendor: "Annapurna Caterers",
      note: "Extra evening snacks, 150 packs",
      status: "committed",
    },
    impact: {
      people: 0,
      attendees: 0,
      volunteers: 0,
      sessions: 0,
      moneyInr: 8_000,
      channels: [],
      reversible: true,
    },
    diff: [
      {
        entity: "ledger_entries",
        id: null,
        before: null,
        after: { categoryId: catId("catering"), amountInr: 8000, status: "committed" },
      },
    ],
    tierReasons: ["Money record", "Category reaches 100% of cap"],
  });
  proposals.push(expense);
  runs.find((r) => r.id === finRun.runId)!.proposalIds.push(expense.id);

  const regRun = addRun("registrar", "reg-dup", ist("2026-10-12", "14:05"), {
    trigger: { type: "domain_event", eventType: "registration.created" },
    tools: ["registrations.search"],
    tokens: [900, 120],
    costUsd: 0.0002,
  });
  proposals.push(
    makeProposal({
      kind: "registration.flag_duplicate",
      eventId,
      proposedBy: regRun.actor,
      domain: "registrations",
      riskTier: "T0",
      createdAt: ist("2026-10-12", "14:05"),
      summary: `Flag a likely duplicate registration for ${dup.name.split(" ")[0]}`,
      rationale: "Same name, college, department and year as an earlier registration with a different email.",
      payload: {
        registrationId: dup.id,
        duplicateOfId: original.id,
        matchType: "fuzzy_name_college",
        score: 0.97,
      },
      diff: [
        {
          entity: "registrations",
          id: dup.id,
          before: { duplicateOfId: null },
          after: { duplicateOfId: original.id },
        },
      ],
      tierReasons: ["Internal record only"],
      status: "executed",
      executedAt: ist("2026-10-12", "14:05"),
    }),
  );

  const crewRun = addRun("crew_chief", "crew-helpdesk", ist(DAY1, "10:08"), {
    trigger: { type: "domain_event", eventType: "incident.created" },
    tools: ["crew.listVolunteers", "crew.listShifts"],
    tokens: [1500, 200],
    costUsd: 0.0003,
  });
  const spareVol = volunteers.find(
    (v) =>
      !shiftAssignments.some((a) => a.volunteerId === v.id && a.shiftId === id("shift", "reg-d1")) &&
      v.skills.includes("registration_desk"),
  )!;
  proposals.push(
    makeProposal({
      kind: "crew.assign_shift",
      eventId,
      proposedBy: crewRun.actor,
      domain: "crew",
      riskTier: "T1",
      createdAt: ist(DAY1, "10:08"),
      summary: `Add ${spareVol.name.split(" ")[0]} to the registration desk until 11:00`,
      rationale:
        "Radar reported a queue over 40 people. This volunteer is free until 12:00 and has the registration desk skill.",
      evidence: [
        { type: "row", ref: `incidents/${id("incident", "queue")}`, label: "Queue at registration desk" },
      ],
      payload: { shiftId: id("shift", "reg-d1"), volunteerId: spareVol.id },
      impact: { people: 1, attendees: 0, volunteers: 1, sessions: 0, channels: ["in_app"], reversible: true },
      diff: [
        {
          entity: "shift_assignments",
          id: null,
          before: null,
          after: { shiftId: id("shift", "reg-d1"), volunteerId: spareVol.id },
        },
      ],
      tierReasons: ["One person affected, reversible"],
      status: "executed",
      executedAt: ist(DAY1, "10:08"),
      undoUntil: ist(DAY1, "10:18"),
    }),
  );

  addRun("helpdesk", "help-sneha", ist(DAY1, "09:50"), {
    trigger: { type: "domain_event", eventType: "helpdesk.message" },
    tools: ["kb.retrieve"],
    tokens: [2400, 180],
    costUsd: 0.0004,
  });
  addRun("radar", "radar-tick", ist(DAY1, "10:28"), {
    tools: ["metrics.snapshot"],
    tokens: [1100, 90],
    costUsd: 0.0002,
    provider: "ollama",
    model: "qwen3:4b-instruct",
  });
  addRun("commander", "cmd-briefing", ist(DAY1, "07:30"), {
    trigger: { type: "schedule", ref: "daily_briefing" },
    tools: ["metrics.snapshot", "planning.overdue"],
    tokens: [5200, 900],
    costUsd: 0.0031,
    provider: "bedrock",
    model: "global.amazon.nova-2-lite-v1:0",
  });

  const pendingFor = (agent: AgentName) =>
    proposals.filter(
      (p) => p.status === "pending" && p.proposedBy.kind === "agent" && p.proposedBy.agent === agent,
    ).length;
  const agents: AgentConfigSummary[] = AgentName.options.map((name) => {
    const domain = AGENT_DOMAIN[name];
    const lead = leadFor[domain];
    const myRuns = runs.filter((r) => r.agent === name);
    const last = myRuns
      .map((r) => r.startedAt)
      .sort()
      .at(-1);
    return {
      name,
      domain,
      humanLeadRole: lead.role,
      humanLeadUserId: lead.userId,
      humanLeadName: lead.name,
      mandate: mandates[name],
      enabled: true,
      autoApproveT1: true,
      modelTier: SMART.includes(name) ? "smart" : "fast",
      health: name === "sponsorship" ? "degraded" : "healthy",
      lastRunAt: last,
      pendingApprovals: pendingFor(name),
      runsToday: myRuns.filter((r) => r.startedAt >= ist(DAY1, "00:00")).length,
      costUsdToday:
        Math.round(
          myRuns.filter((r) => r.startedAt >= ist(DAY1, "00:00")).reduce((s, r) => s + r.costUsd, 0) * 10_000,
        ) / 10_000,
    };
  });

  // ---------------------------------------------------------------- domain events
  const sys: Actor = { kind: "system", eventId, reason: "fixture" };
  const de = (
    key: string,
    type: DomainEvent["type"],
    entity: string,
    entityId: string,
    at: string,
    payload: Record<string, unknown>,
    actor: Actor = sys,
  ): DomainEvent => ({ id: id("domain-event", key), eventId, type, entity, entityId, actor, payload, at });
  const domainEvents: DomainEvent[] = [
    de("ann-welcome", "announcement.sent", "announcements", announcements[0]!.id, ist(DAY1, "08:00"), {
      recipients: 320,
    }),
    de("inc-wifi", "incident.created", "incidents", incidents[0]!.id, ist(DAY1, "08:48"), {
      incidentId: incidents[0]!.id,
      category: "it",
      severity: "low",
      emergency: false,
    }),
    de("sneha-in", "registration.checked_in", "checkins", checkins[0]!.id, checkins[0]!.serverTime, {
      registrationId: sneha.id,
      ticketId: checkins[0]!.ticketId,
      checkinId: checkins[0]!.id,
      scannerUserId: checkins[0]!.scannerUserId,
      deviceTime: checkins[0]!.deviceTime,
      offline: false,
    }),
    de(
      "inc-queue",
      "incident.created",
      "incidents",
      incidents[1]!.id,
      ist(DAY1, "09:22"),
      { incidentId: incidents[1]!.id, category: "queue", severity: "medium", emergency: false },
      actorOf("radar", id("run", "radar-tick")),
    ),
    de("help-sneha", "helpdesk.message", "messages", messages[0]!.id, ist(DAY1, "09:50"), {
      conversationId: convSneha.id,
      messageId: messages[0]!.id,
      channel: "in_app",
      askerRole: "attendee",
      askerUserId: sneha.userId,
      text: messages[0]!.body,
    }),
    de("crew-exec", "proposal.executed", "proposals", proposals[4]!.id, ist(DAY1, "10:08"), {
      proposalId: proposals[4]!.id,
      kind: "crew.assign_shift",
    }),
    de(
      "move-created",
      "proposal.created",
      "proposals",
      moveRoom.id,
      moveRoom.createdAt,
      { proposalId: moveRoom.id, kind: moveRoom.kind, riskTier: moveRoom.riskTier, status: "pending" },
      schedRun.actor,
    ),
    de(
      "official-created",
      "proposal.created",
      "proposals",
      official.id,
      official.createdAt,
      { proposalId: official.id, kind: official.kind, riskTier: official.riskTier, status: "pending" },
      heraldRun.actor,
    ),
    de(
      "expense-created",
      "proposal.created",
      "proposals",
      expense.id,
      expense.createdAt,
      { proposalId: expense.id, kind: expense.kind, riskTier: expense.riskTier, status: "pending" },
      finRun.actor,
    ),
  ].sort((a, b) => b.at.localeCompare(a.at));

  // ---------------------------------------------------------------- briefing, what-if, playbook
  const summary = financeSummary(budgetCategories, ledgerEntries);
  const catering = summary.categories.find((c) => c.key === "catering")!;
  const checkedIn = checkins.filter((c) => !c.duplicate).length;
  const briefing: Briefing = {
    id: id("briefing", DAY1),
    eventId,
    date: DAY1,
    scope: { full: true },
    sections: [
      {
        key: "today",
        title: "Today",
        narrative:
          "Day 1 opens at 09:30 with the keynote. 16 sessions across 2 days; workshops start at 11:00.",
        factIds: ["sessions.total"],
      },
      {
        key: "at_risk",
        title: "At risk",
        narrative:
          "The fine-tuning workshop in Lab 204 has 95 registrations for 60 seats. The final food count to the caterer is overdue.",
        factIds: ["session.s03.registered", "room.lab204.capacity", "milestone.food-final.status"],
      },
      {
        key: "money",
        title: "Money",
        narrative: "Catering is at 92% of its cap. Overall 40% of the 3 lakh budget is used.",
        factIds: ["budget.catering.used", "budget.total.used"],
      },
      {
        key: "registrations",
        title: "Registrations",
        narrative: "320 confirmed against a target of 500, with 40 on the waitlist.",
        factIds: ["registrations.confirmed", "registrations.target", "registrations.waitlisted"],
      },
    ],
    facts: [
      { id: "sessions.total", label: "Sessions scheduled", value: sessions.length, source: "sessions.list" },
      {
        id: "session.s03.registered",
        label: "Fine-tuning workshop registrations",
        value: s03.registeredCount,
        source: `sessions/${s03.id}`,
      },
      {
        id: "room.lab204.capacity",
        label: "Lab 204 seats",
        value: lab204.capacity,
        source: `rooms/${lab204.id}`,
      },
      {
        id: "milestone.food-final.status",
        label: "Final food count",
        value: "in_progress, due 23 Oct",
        source: `milestones/${id("milestone", "food-final")}`,
      },
      {
        id: "budget.catering.used",
        label: "Catering used",
        value: catering.usedRatio,
        source: "finance.summary",
      },
      {
        id: "budget.total.used",
        label: "Budget used overall",
        value: Math.round(((summary.spentInr + summary.committedInr) / summary.totalCapInr) * 100) / 100,
        source: "finance.summary",
      },
      {
        id: "registrations.confirmed",
        label: "Confirmed registrations",
        value: confirmed.length,
        source: "registrations.stats",
      },
      { id: "registrations.target", label: "Registration target", value: 500, source: "events.settings" },
      {
        id: "registrations.waitlisted",
        label: "Waitlisted",
        value: TOTAL_WAITLISTED,
        source: "registrations.stats",
      },
      { id: "checkins.count", label: "Checked in so far", value: checkedIn, source: "metrics.snapshot" },
    ],
    generatedBy: "model",
    generatedAt: ist(DAY1, "07:31"),
  };

  const whatIf: WhatIfResult = {
    id: id("whatif", "plus30"),
    eventId,
    simulation: true,
    scenario: "What if 30% more people show up?",
    assumptions: [
      { label: "Attendance multiplier", value: "1.3x confirmed (416 people)" },
      { label: "Rooms", value: "No extra rooms available" },
    ],
    perturbations: [{ type: "attendance_multiplier", value: 1.3 }],
    impacts: [
      {
        domain: "schedule",
        summary: "Lab 204 and Seminar Hall 3 overflow in the 11:00 slot.",
        metrics: [{ label: "Sessions over capacity", before: 1, after: 3 }],
      },
      {
        domain: "crew",
        summary: "Registration desk needs 2 more volunteers between 09:00 and 10:00.",
        metrics: [{ label: "Desk volunteers needed", before: 4, after: 6 }],
      },
      {
        domain: "logistics",
        summary: "Lunch plates go up by about 100.",
        metrics: [{ label: "Lunch plates", before: 320, after: 416, unit: "plates" }],
      },
    ],
    recommendations: [
      {
        status: "simulated",
        kind: "schedule.change_room",
        summary: "Move the fine-tuning workshop to the Main Auditorium",
        riskTier: "T2",
        impact: {
          people: 124,
          attendees: 124,
          volunteers: 0,
          sessions: 1,
          channels: ["in_app"],
          reversible: true,
        },
        diff: [],
      },
      {
        status: "simulated",
        kind: "crew.assign_shift",
        summary: "Add 2 volunteers to the registration desk",
        riskTier: "T1",
        impact: {
          people: 2,
          attendees: 0,
          volunteers: 2,
          sessions: 0,
          channels: ["in_app"],
          reversible: true,
        },
        diff: [],
      },
    ],
    confidence: 0.7,
    createdAt: ist(DAY1, "10:00"),
  };

  const playbookLessons: PlaybookLesson[] = [
    {
      id: id("lesson", 1),
      eventType: "tech_fest",
      title: "Open a second check-in desk before 09:00",
      lesson: "Last year's queue peaked at 60 people at 09:15. A second desk from 08:45 halved the wait.",
      tags: ["check-in", "crew"],
      createdAt: ist("2025-10-30", "12:00"),
    },
    {
      id: id("lesson", 2),
      eventType: "tech_fest",
      title: "Workshops overflow; book a backup hall",
      lesson:
        "Hands-on workshops were oversubscribed by 50% on average. Keep a large room free in the same slot.",
      tags: ["schedule"],
      createdAt: ist("2025-10-30", "12:00"),
    },
    {
      id: id("lesson", 3),
      eventType: "hackathon",
      title: "Midnight snacks run out first",
      lesson: "Plan 1.2 midnight snack packs per participant; the last batch ran out at 01:00.",
      tags: ["food", "finance"],
      createdAt: ist("2025-03-15", "12:00"),
    },
  ];

  return {
    org: { id: orgId, name: "Deccan Institute of Engineering and Technology", slug: "deccan-institute" },
    users,
    memberships,
    personas,
    event,
    rooms,
    tracks,
    sessions,
    speakers,
    registrations,
    teams,
    tickets,
    checkins,
    volunteers,
    availability,
    shifts,
    shiftAssignments,
    tasks,
    incidents,
    kbDocuments,
    conversations,
    messages,
    escalations,
    announcements,
    milestones,
    budgetCategories,
    ledgerEntries,
    quotes,
    sponsorProspects,
    marketingPosts,
    funnel,
    checklists,
    inventory,
    proposals,
    agents,
    agentRuns: runs,
    agentSteps: steps,
    domainEvents,
    briefings: [briefing],
    whatIfRuns: [whatIf],
    playbookLessons,
    now,
  };
}

export { diffHashOf };
