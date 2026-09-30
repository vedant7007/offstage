// SAMPLE DATA for the /design review page only. Not event facts; never import this elsewhere.
// Shapes mirror src/contracts so components are reviewed against realistic input.

import type { DiffEntry, Evidence, Impact } from "@/components/ui";

export const sampleProposal = {
  agent: "scheduler",
  summary: "Move \"Intro to Rust\" to 3:00 pm in Seminar Hall",
  rationale:
    "The speaker cancelled the 11:00 am slot. Seminar Hall is free at 3:00 pm, fits all 58 registered attendees, and no one registered has a clash then.",
  evidence: [
    { type: "row", ref: "session:s-12", label: "Session s-12" },
    { type: "kb", ref: "kb:venue-notes#2", label: "Venue notes, 2" },
    { type: "metric", ref: "metric:clashes", label: "0 clashes found" },
  ] satisfies Evidence[],
  impact: {
    people: 61,
    attendees: 58,
    volunteers: 2,
    sessions: 1,
    channels: ["in_app", "telegram", "whatsapp"],
    reversible: true,
  } satisfies Impact,
  diff: [
    {
      entity: "session",
      id: "s-12",
      before: { title: "Intro to Rust", startsAt: "2026-10-24T05:30:00.000Z", endsAt: "2026-10-24T06:30:00.000Z", roomId: "Lab 204" },
      after: { title: "Intro to Rust", startsAt: "2026-10-24T09:30:00.000Z", endsAt: "2026-10-24T10:30:00.000Z", roomId: "Seminar Hall" },
    },
    {
      entity: "shift_assignment",
      id: "sa-7",
      before: { volunteer: "Ravi", note: null },
      after: { volunteer: "Ravi", note: "Moved with session" },
    },
  ] satisfies DiffEntry[],
  diffLabels: { startsAt: "Start time", endsAt: "End time", roomId: "Room", volunteer: "Volunteer", note: "Note" },
};

export const sampleSimulated = {
  agent: "commander",
  summary: "What if 30% more people come: open Lab 3 as overflow",
  rationale: "Simulation only. Main hall would be over capacity by 96 seats at the 10:00 am keynote.",
  impact: { people: 96, attendees: 96, volunteers: 3, sessions: 1, channels: [], reversible: true } satisfies Impact,
};

export const sampleExpense = {
  agent: "finance",
  summary: "Record catering advance of ₹18,000",
  rationale: "Invoice uploaded by the treasurer. Catering would reach 98% of its budget.",
  impact: { people: 0, attendees: 0, volunteers: 0, sessions: 0, moneyInr: 18000, channels: [], reversible: false } satisfies Impact,
};

export const sampleSessions = [
  { id: "s-3", title: "Opening keynote", room: "Main Hall", start: "2026-10-24T04:00:00.000Z", end: "2026-10-24T05:00:00.000Z", status: "executed" },
  { id: "s-12", title: "Intro to Rust", room: "Lab 204", start: "2026-10-24T05:30:00.000Z", end: "2026-10-24T06:30:00.000Z", status: "pending" },
  { id: "s-14", title: "Designing for 360 px", room: "Lab 204", start: "2026-10-24T08:00:00.000Z", end: "2026-10-24T09:00:00.000Z", status: "approved" },
] as const;

export const sampleTimeline = [
  { id: "1", agent: "radar", title: "12 questions about lunch in 10 minutes", time: "2026-10-24T07:02:00.000Z" },
  { id: "2", agent: "herald", title: "Announcement drafted: lunch is in the Canteen Block", time: "2026-10-24T07:03:00.000Z" },
  { id: "3", agent: "helpdesk", title: "Answer updated with the new lunch location", time: "2026-10-24T07:05:00.000Z" },
];

export const sampleCitation = {
  document: "Rulebook",
  section: "4.2 Team size",
  snippet: "Teams have 2 to 4 members. Every member must be registered individually before check-in closes at 9:30 am on Day 1.",
};

export const sampleEvent = {
  name: "HackNova 2026",
  venue: "Main Auditorium and Labs 201 to 204",
  capacity: 320,
  seatsTaken: 287,
  start: "2026-10-24T03:30:00.000Z",
  end: "2026-10-25T12:30:00.000Z",
  budget: 300000,
};
