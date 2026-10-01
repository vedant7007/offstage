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
  { id: "chaos", label: "The problem", cue: "01" },
  { id: "commander", label: "The solution", cue: "02" },
  { id: "how", label: "How it works", cue: "03" },
  { id: "crew", label: "The crew", cue: "04" },
  { id: "show", label: "Live ops board", cue: "05" },
  { id: "features", label: "What runs backstage", cue: "06" },
  { id: "proof", label: "Proof", cue: "07" },
  { id: "trust", label: "Trust", cue: "08" },
  { id: "final", label: "Curtain call", cue: null },
] as const;

export type ActId = (typeof ACTS)[number]["id"];

export const actLabel = (i: number) => {
  const act = ACTS[i] ?? ACTS[0];
  return act.cue ? `Cue ${act.cue}: ${act.label}` : act.label;
};

/**
 * Chaos cards: text, where they sit on the stage (percent of the area under the nav, clear of the
 * heading), and how far they drift, sink and turn. Cards in one row drift the same way, so their
 * text never slides under a neighbour.
 */
export type ChaosCard = {
  t: string;
  x: number;
  y: number;
  dx: number;
  dz: number;
  ry: number;
  rz: number;
  red?: boolean;
};
export const CHAOS: ChaosCard[] = [
  {
    t: "Plans split across WhatsApp groups and five people’s heads.",
    x: 47,
    y: 0,
    dx: -70,
    dz: 70,
    ry: -7,
    rz: -2,
  },
  { t: "The same questions, asked again and again.", x: 72, y: 7, dx: -70, dz: 110, ry: 6, rz: 2 },
  {
    t: "A speaker cancels. Nobody hears about it in time.",
    x: 47,
    y: 28,
    dx: 60,
    dz: -60,
    ry: -5,
    rz: -3,
    red: true,
  },
  { t: "Volunteers unsure where to be or what comes next.", x: 71, y: 34, dx: 60, dz: 40, ry: 8, rz: 1 },
  { t: "Money tracked in chat threads and memory.", x: 3, y: 55, dx: -50, dz: -90, ry: -6, rz: 3 },
  { t: "No proper report when the event ends.", x: 26, y: 63, dx: -50, dz: 130, ry: 5, rz: -2 },
  { t: "WiFi collapses at peak check-in.", x: 49, y: 57, dx: -50, dz: 20, ry: -8, rz: 2, red: true },
  {
    t: "Faculty approvals, OD letters, certificates: a paper trail with no end.",
    x: 72,
    y: 65,
    dx: -50,
    dz: -120,
    ry: 7,
    rz: -1,
  },
];

export const CMD: Step[] = [
  { t: "The organiser talks to the Commander.", a: "Organiser" },
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

/** The other thirteen, in the order they turn past on the ring around the Commander. */
export const CREW: Agent[] = [
  { name: "Planner", does: "Timeline, milestones, overdue work.", lead: "Event head" },
  { name: "Finance", does: "Budget, ledger, overspend warnings. Never pays.", lead: "Treasurer" },
  { name: "Sponsorship", does: "Prospects, pitch drafts, follow-ups.", lead: "Sponsorship lead" },
  { name: "Marketing", does: "Content calendar, post drafts, registration funnel.", lead: "Marketing lead" },
  { name: "Registrar", does: "Registrations, waitlist, duplicates, teams.", lead: "Registrations lead" },
  { name: "Scheduler", does: "Sessions, rooms, clashes, replanning.", lead: "Program lead" },
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
  { t: "It pulls in the Scheduler, Speaker Liaison, Crew Chief, Herald and Helpdesk.", a: "Commander" },
  { t: "The solver checks every room and slot.", a: "Scheduler" },
  { t: "Three valid slots come back.", a: "Scheduler" },
  { t: "Ripple view shows everyone the move touches.", a: "Commander" },
  { t: "Policy marks it T3: two approvals needed.", a: "Policy" },
  { t: "The program lead approves.", a: "Program lead" },
  { t: "Faculty approves on their phone.", a: "Faculty" },
  { t: "Attendees, volunteers and the speaker hear it on their own channel.", a: "Herald" },
  { t: "Helpdesk answers with the new time.", a: "Helpdesk" },
];

/** From the seeded HackNova speaker-cancel run in docs/demo-script.md. */
export const IMPACT = [
  { n: 93, label: "attendees told" },
  { n: 2, label: "volunteers moved" },
  { n: 1, label: "session moved" },
  { n: 2, label: "human approvals" },
];

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
    t: "Ripple view",
    d: "Change one session and see everything it touches: rooms, attendees, volunteers, announcements and helpdesk answers, before anything changes.",
  },
  {
    t: "Glass-box agents",
    d: "Every agent step shows its model, tokens, cost and the evidence it cited. Nothing happens in a black box.",
  },
  {
    t: "Check-in when WiFi dies",
    d: "Volunteers keep checking people in with no network. Scans queue on the phone and sync, with duplicates flagged, when WiFi returns.",
  },
  {
    t: "Confusion Radar",
    d: "When 8 people ask the same thing in 10 minutes, Radar raises it and proposes an announcement before the queue grows.",
  },
  {
    t: "Built for Indian colleges",
    d: "OD letters, certificates with a public verify page, faculty approvals: handled the way your campus actually works.",
  },
  {
    t: "What-if simulator",
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

/**
 * The proof strip, as the team measured it during the hackathon (golden eval set, guard suite,
 * solver checks and a full demo run). Labels come from i18n keys under "theatre.landing".
 */
export const PROOF = [
  { value: "95%", key: "proofGrounding" },
  { value: "20 / 20", key: "proofInjections" },
  { value: "42 / 42", key: "proofSolver" },
  { value: null, key: "proofCost" },
] as const;

export const TEAM = ["Vedant Idlgave", "Abhinav Nakka", "V Thanishka"];

export const BOW = [
  "Event completed.",
  "Operations closed.",
  "Reports created.",
  "Certificates prepared.",
  "Lessons saved.",
];
