/*
 * Copy for the landing theatre. Every claim here is checked against docs/00-BLUEPRINT.md and the
 * running product: agent leads from section 4, tiers from the risk table, the 2:03 PM keynote
 * cancel and its numbers from docs/demo-script.md.
 */

export type Step = { t: string; a: string };
export type Feature = { t: string; d: string };
export type Agent = { name: string; does: string; lead: string };

/** Acts in page order. `label` is the one name each act uses in the nav cue, the rail and the h2 kicker. */
export const ACTS = [
  { id: "opening", label: "Opening", cue: null },
  { id: "chaos", label: "The chaos", cue: "01" },
  { id: "commander", label: "Enter the Commander", cue: "02" },
  { id: "crew", label: "The crew", cue: "03" },
  { id: "show", label: "The show must go on", cue: "04" },
  { id: "rule", label: "The rule", cue: "05" },
  { id: "features", label: "What runs backstage", cue: "06" },
  { id: "trust", label: "Trust", cue: "07" },
  { id: "final", label: "Curtain call", cue: null },
] as const;

export type ActId = (typeof ACTS)[number]["id"];

export const actLabel = (i: number) => {
  const act = ACTS[i] ?? ACTS[0];
  return act.cue ? `Cue ${act.cue}: ${act.label}` : act.label;
};

/** Chaos cards: text, where they sit on a wide stage, and how far they drift and turn. */
export const CHAOS = [
  { t: "Operations scattered across WhatsApp and five different people.", x: 4, y: 26, dx: 180, ry: -7, rz: -2 },
  { t: "The same questions, asked again and again.", x: 38, y: 9, dx: -150, ry: 6, rz: 2 },
  { t: "A speaker cancels. Nobody hears about it in time.", x: 71, y: 21, dx: 120, ry: -5, rz: -3, red: true },
  { t: "Volunteers unsure where to be, or what to do next.", x: 8, y: 64, dx: -190, ry: 8, rz: 1 },
  { t: "Money tracked across chat windows and memory.", x: 44, y: 54, dx: 160, ry: -6, rz: 3 },
  { t: "No proper report when the event ends.", x: 74, y: 61, dx: -120, ry: 5, rz: -2 },
  { t: "WiFi collapses at peak check-in.", x: 18, y: 82, dx: 200, ry: -8, rz: 2, red: true },
  {
    t: "Faculty approvals, OD letters, certificates: a paper trail with no end.",
    x: 54,
    y: 84,
    dx: -160,
    ry: 7,
    rz: -1,
  },
];

export const CMD: Step[] = [
  { t: "The organizer talks to the Commander.", a: "Organizer" },
  { t: "The Commander interviews them about the event.", a: "Commander" },
  { t: "It drafts the event plan and the timeline.", a: "Commander" },
  { t: "It builds the agent team for this event.", a: "Commander" },
  { t: "Every agent reports to a human lead.", a: "Commander" },
];

export const COMMANDER: Agent = {
  name: "Commander",
  does: "Intake interview, event plan, agent team, daily briefing, what-if, conflict resolution.",
  lead: "Event head",
};

/** The other thirteen, split across the inner and outer ring. */
export const CREW_IN: Agent[] = [
  { name: "Planner", does: "Timeline, milestones, overdue work.", lead: "Event head" },
  { name: "Finance", does: "Budget, ledger, overspend warnings. Never pays.", lead: "Treasurer" },
  { name: "Sponsorship", does: "Prospects, pitch drafts, follow-ups.", lead: "Sponsorship lead" },
  { name: "Marketing", does: "Content calendar, post drafts, registration funnel.", lead: "Marketing lead" },
  { name: "Registrar", does: "Registrations, waitlist, duplicates, teams.", lead: "Registrations lead" },
  { name: "Scheduler", does: "Sessions, rooms, clashes, replanning.", lead: "Program lead" },
];

export const CREW_OUT: Agent[] = [
  { name: "Speaker Liaison", does: "Confirmations, AV and travel needs, reminders.", lead: "Program lead" },
  { name: "Crew Chief", does: "Volunteer shifts, no-shows, breaks.", lead: "Volunteer lead" },
  { name: "Logistics", does: "Rooms, AV, food counts, inventory.", lead: "Logistics lead" },
  { name: "Herald", does: "Announcements and reminders. Sends after approval.", lead: "Comms lead" },
  { name: "Helpdesk", does: "Questions, cited answers, escalation.", lead: "Comms lead" },
  { name: "Radar", does: "Check-ins, question spikes, incidents, voice notes.", lead: "Ops lead" },
  { name: "Chronicler", does: "Reports, certificates, OD lists, lessons.", lead: "Event head" },
];

export const CHAIN: Step[] = [
  { t: "The keynote speaker cancels at 2:03 PM.", a: "Input" },
  { t: "The cancellation wakes the Commander.", a: "Commander" },
  { t: "It pulls in the Scheduler, Crew Chief, Herald and Helpdesk.", a: "Commander" },
  { t: "The solver checks every room and slot.", a: "Scheduler" },
  { t: "Three valid slots come back.", a: "Scheduler" },
  { t: "Ripple shows everyone the move touches.", a: "Commander" },
  { t: "Policy marks it T3: two approvals needed.", a: "Policy" },
  { t: "The Program lead approves.", a: "Program lead" },
  { t: "Faculty approves on their phone.", a: "Faculty" },
  { t: "Attendees, the volunteer and the speaker hear it on their channel.", a: "Herald" },
  { t: "Helpdesk answers with the new time.", a: "Helpdesk" },
];

/** From the seeded HackNova speaker-cancel run in docs/demo-script.md. */
export const IMPACT = [
  { n: 93, label: "attendees told" },
  { n: 2, label: "volunteers moved" },
  { n: 1, label: "session moved" },
  { n: 2, label: "human approvals" },
];
export const IMPACT_CAPTION = "Illustrative, from the seeded HackNova demo";

export const LAW = ["Agents propose.", "Policy decides.", "Humans approve.", "Code executes."];
export const LAW_LINE = LAW.join(" ");

export const TIERS = [
  { tier: "T0", text: "Internal records only: automatic." },
  { tier: "T1", text: "One person, reversible: automatic, with a 10-minute undo." },
  { tier: "T2", text: "Many people, public, or money: the agent's human lead approves." },
  { tier: "T3", text: "Irreversible, official or bulk: two approvals, owner or faculty when configured." },
];

export const FEATS: Feature[] = [
  {
    t: "Ripple View",
    d: "Change one session and see everything it touches: rooms, attendees, volunteers, announcements and helpdesk answers, before anything changes.",
  },
  {
    t: "Glass-box Agents",
    d: "Every agent step shows its model, tokens, cost and the evidence it cited. Nothing happens in a black box.",
  },
  {
    t: "Check-in When WiFi Dies",
    d: "Volunteers keep checking people in with no network. Scans queue on the phone and sync, with duplicates flagged, when WiFi returns.",
  },
  {
    t: "Confusion Radar",
    d: "When 8 people ask the same thing in 10 minutes, Radar raises it and proposes an announcement before the queue grows.",
  },
  {
    t: "Built for Indian Colleges",
    d: "OD letters, certificates with a public verify page, faculty approvals: handled the way your campus actually works.",
  },
  {
    t: "What-if Simulator",
    d: "Lose a speaker or a room, cut the budget, or add 30% more people. See the impact in a sandbox, with real data untouched.",
  },
];

export const TRUST = [
  "Humans approve what matters.",
  "Cited sources for every answer.",
  "“I don’t know” when it doesn’t know.",
  "Designed against the OWASP LLM Top 10.",
  "Minimum data, by default.",
  "Aligned with DPDP principles.",
];

export const BOW = [
  "Event completed.",
  "Operations closed.",
  "Reports created.",
  "Certificates prepared.",
  "Lessons saved.",
];
