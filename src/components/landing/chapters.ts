/*
 * The eleven chapters of the landing film: the copy beside the stage box and the 3D state the
 * scene glides to while that chapter is on screen. Numbers that were never measured are
 * labelled illustrative or target in the copy itself.
 */

export type Side = "left" | "right" | "center";

export interface SceneState {
  /** Camera in spherical coordinates around the target: distance, azimuth and elevation in degrees. */
  r: number;
  theta: number;
  phi: number;
  target: [number, number, number];
  fov: number;
  /** Camera roll in degrees (the Dutch angle in the chaos chapter). */
  dutch: number;
  key: string;
  keyIntensity: number;
  spot: number;
  rim: number;
  ambient: number;
  curtain: number;
}

export interface Chapter {
  id: string;
  cue: string;
  side: Side;
  /** Chapter height in viewport heights. */
  vh: number;
  headline: string[];
  body?: string[];
  scene: SceneState;
}

export const TUNGSTEN = "#FFB23F";
export const CUE_BLUE = "#4DA3FF";
export const CURTAIN_RED = "#C8404F";
export const GO_GREEN = "#4CC38A";

export const CHAPTERS: Chapter[] = [
  {
    id: "title",
    cue: "Title",
    side: "center",
    vh: 140,
    headline: ["The show goes on.", "We run everything behind it."],
    scene: {
      r: 9.5,
      theta: 0,
      phi: 4,
      target: [0, 2.1, 1.7],
      fov: 32,
      dutch: 0,
      key: TUNGSTEN,
      keyIntensity: 0.55,
      spot: 1,
      rim: 0,
      ambient: 0.35,
      curtain: 0,
    },
  },
  {
    id: "chaos",
    cue: "Chaos",
    side: "left",
    vh: 150,
    headline: [
      "Behind every event:",
      "5 WhatsApp groups,",
      "the same 30 questions 500 times,",
      "and one cancellation that",
      "breaks everything.",
    ],
    scene: {
      r: 8.5,
      theta: -12,
      phi: 8,
      target: [0, 1.8, 0],
      fov: 36,
      dutch: 4,
      key: CURTAIN_RED,
      keyIntensity: 1.9,
      spot: 0.35,
      rim: 0.1,
      ambient: 0.2,
      curtain: 0.6,
    },
  },
  {
    id: "commander",
    cue: "Commander",
    side: "right",
    vh: 150,
    headline: ["Tell OFFSTAGE about your event.", "It asks what a veteran", "event manager would ask."],
    scene: {
      r: 7.5,
      theta: 4,
      phi: 6,
      target: [0, 1.7, 0.3],
      fov: 34,
      dutch: 0,
      key: TUNGSTEN,
      keyIntensity: 1.35,
      spot: 0.7,
      rim: 0.35,
      ambient: 0.35,
      curtain: 0.9,
    },
  },
  {
    id: "crew",
    cue: "Crew",
    side: "left",
    vh: 160,
    headline: ["14 AI agents.", "One human lead each."],
    scene: {
      r: 9,
      theta: 20,
      phi: 12,
      target: [0, 1.7, -0.2],
      fov: 38,
      dutch: 0,
      key: TUNGSTEN,
      keyIntensity: 1.1,
      spot: 0.6,
      rim: 0.9,
      ambient: 0.35,
      curtain: 1,
    },
  },
  {
    id: "preparation",
    cue: "Preparation",
    side: "right",
    vh: 150,
    headline: ["Registrations, schedules,", "shifts, reminders and answers,", "running on their own."],
    scene: {
      r: 9.5,
      theta: 10,
      phi: 40,
      target: [0.2, 0.6, 0],
      fov: 38,
      dutch: 0,
      key: TUNGSTEN,
      keyIntensity: 1.0,
      spot: 0.8,
      rim: 1.1,
      ambient: 0.4,
      curtain: 1,
    },
  },
  {
    id: "crisis",
    cue: "Crisis",
    side: "left",
    vh: 200,
    headline: ["2:03 PM.", "The keynote speaker cancels."],
    scene: {
      r: 10,
      theta: 4,
      phi: 26,
      target: [-0.3, 1.2, -0.3],
      fov: 36,
      dutch: 0,
      key: CURTAIN_RED,
      keyIntensity: 0.55,
      spot: 0.12,
      rim: 0.35,
      ambient: 0.08,
      curtain: 1,
    },
  },
  {
    id: "approval",
    cue: "Approval",
    side: "right",
    vh: 170,
    headline: ["The agents propose.", "A human decides."],
    body: ["Anything that touches people, money or reputation waits for a human yes."],
    scene: {
      r: 8,
      theta: -15,
      phi: 26,
      target: [0.4, 0.6, 0.6],
      fov: 36,
      dutch: 0,
      // Kept at the crisis light: the tungsten flood is tied to the button press inside this chapter.
      key: CURTAIN_RED,
      keyIntensity: 0.55,
      spot: 0.12,
      rim: 0.35,
      ambient: 0.08,
      curtain: 1,
    },
  },
  {
    id: "fanout",
    cue: "Fan-out",
    side: "left",
    vh: 150,
    headline: ["45 minutes of phone calls.", "Or 90 seconds and one tap."],
    scene: {
      r: 9.5,
      theta: -25,
      phi: 6,
      target: [0, 2.4, 0],
      fov: 40,
      dutch: 0,
      key: TUNGSTEN,
      keyIntensity: 1.0,
      spot: 0.7,
      rim: 1.3,
      ambient: 0.35,
      curtain: 1,
    },
  },
  {
    id: "rule",
    cue: "The rule",
    side: "right",
    vh: 160,
    headline: ["The rule."],
    scene: {
      r: 10,
      theta: 0,
      phi: 6,
      target: [0, 3.3, 1.5],
      fov: 36,
      dutch: 0,
      key: TUNGSTEN,
      keyIntensity: 0.8,
      spot: 0.4,
      rim: 0.6,
      ambient: 0.3,
      curtain: 1,
    },
  },
  {
    id: "any-event",
    cue: "Any event",
    side: "left",
    vh: 170,
    headline: ["The event type chooses the crew,", "the checklists and the approval rules."],
    scene: {
      r: 8.5,
      theta: 16,
      phi: 18,
      target: [0, 1.0, -0.2],
      fov: 36,
      dutch: 0,
      key: TUNGSTEN,
      keyIntensity: 1.1,
      spot: 0.8,
      rim: 0.6,
      ambient: 0.4,
      curtain: 1,
    },
  },
  {
    id: "curtain-call",
    cue: "Curtain call",
    side: "center",
    vh: 150,
    headline: ["The show goes on."],
    scene: {
      r: 9.5,
      theta: 0,
      phi: 4,
      target: [0, 2.1, 1.7],
      fov: 32,
      dutch: 0,
      key: TUNGSTEN,
      keyIntensity: 0.4,
      spot: 1,
      rim: 0,
      ambient: 0.2,
      curtain: 0,
    },
  },
];

export const CHAPTER_COUNT = CHAPTERS.length;

/** The agents by department, with the human lead each one pairs with. */
export const DEPARTMENTS: { name: string; agents: { name: string; lead: string }[] }[] = [
  {
    name: "Plan",
    agents: [
      { name: "Commander", lead: "Event head" },
      { name: "Planner", lead: "Event head" },
      { name: "Finance", lead: "Treasurer" },
      { name: "Sponsorship", lead: "Sponsorship lead" },
    ],
  },
  {
    name: "People",
    agents: [
      { name: "Marketing", lead: "Marketing lead" },
      { name: "Registrar", lead: "Registrations lead" },
      { name: "Speaker Liaison", lead: "Program lead" },
      { name: "Crew Chief", lead: "Volunteer lead" },
    ],
  },
  {
    name: "Show",
    agents: [
      { name: "Scheduler", lead: "Program lead" },
      { name: "Logistics", lead: "Logistics lead" },
      { name: "Herald", lead: "Comms lead" },
      { name: "Helpdesk", lead: "Comms lead" },
    ],
  },
  {
    name: "Watch and close",
    agents: [
      { name: "Radar", lead: "Ops lead" },
      { name: "Chronicler", lead: "Event head" },
    ],
  },
];

/** The crisis log, printed line by line as the crisis chapter scrolls. `at` is the local progress. */
export const CRISIS_LOG: { at: number; time: string; who: string; text: string }[] = [
  { at: 0.1, time: "14:02", who: "RADAR > COMMANDER", text: "Speaker cancelled, Main Auditorium" },
  { at: 0.28, time: "14:02", who: "SCHEDULER", text: "3 valid slots found (solver-verified)" },
  { at: 0.42, time: "14:03", who: "CREW CHIEF", text: "4 volunteers reassigned" },
  { at: 0.55, time: "14:03", who: "HERALD", text: "notices drafted for 3 audiences" },
  { at: 0.7, time: "14:03", who: "COMMANDER > YOU", text: "Approve plan?" },
];

export const RIPPLE_LABELS = ["265 attendees", "4 volunteers", "3 announcements", "3 helpdesk answers"];

export const CHANNELS = ["WhatsApp", "Telegram", "Email", "SMS", "In-app"];

export const RULE_PANELS = ["AGENTS PROPOSE", "POLICY DECIDES", "HUMANS APPROVE", "CODE EXECUTES"];

export const TIERS: { tier: string; text: string }[] = [
  { tier: "T0", text: "Internal record only. Runs on its own." },
  { tier: "T1", text: "One person, reversible. Runs with a 10-minute undo." },
  { tier: "T2", text: "Many people, public, or money. The agent's human lead approves." },
  { tier: "T3", text: "Irreversible, official or bulk. Two approvals, faculty when configured." },
];

export const EVENT_TYPES = [
  "tech fest",
  "hackathon",
  "wedding",
  "marathon",
  "charity drive",
  "product launch",
];

export const COMMANDER_CHAT: { who: "Organizer" | "Commander"; text: string }[] = [
  { who: "Organizer", text: "2-day tech fest, 1500 people, 24 Oct, budget 3 lakh." },
  { who: "Commander", text: "Got it. Parallel tracks? Paid entry? Does faculty approve official notices?" },
];
