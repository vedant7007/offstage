// Radar's detectors. Pure code over read data, so a spike is found the same way with or without a model.

import type { Checkin, Room } from "@/contracts";
import type { HelpdeskQuestion } from "@/agents/runtime/services";

/** Topics people get confused about on the day, in English and Hinglish. */
export const TOPICS = [
  {
    key: "food",
    label: "lunch and food",
    query: "lunch time and place",
    re: /\b(lunch|breakfast|dinner|snacks?|food|khana|coupon|food court|meal)\b/i,
  },
  {
    key: "wifi",
    label: "Wi-Fi",
    query: "wifi network and password",
    re: /\b(wi-?fi|internet|password|network)\b/i,
  },
  { key: "washroom", label: "washrooms", query: "washrooms", re: /\b(washroom|toilet|restroom|bathroom)\b/i },
  { key: "parking", label: "parking", query: "parking", re: /\b(parking|park my|bike stand)\b/i },
  {
    key: "checkin",
    label: "check-in and badges",
    query: "registration desk check-in badge",
    re: /\b(badge|check-?in|registration desk|ticket|qr)\b/i,
  },
] as const;
export type Topic = (typeof TOPICS)[number];

/** Confusion Radar: this many questions on one topic within the window raise an incident. */
export const CONFUSION_THRESHOLD = 8;
export const CONFUSION_WINDOW_MIN = 10;
/** Queue spike: this many check-ins within the window mean the desk needs help. */
export const QUEUE_THRESHOLD = 30;
export const QUEUE_WINDOW_MIN = 5;

export function topicOf(text: string): Topic | undefined {
  return TOPICS.find((t) => t.re.test(text));
}

/** The topic most asked about in the window, when it crosses the threshold. */
export function confusion(questions: HelpdeskQuestion[]) {
  const byTopic = new Map<Topic, HelpdeskQuestion[]>();
  for (const q of questions) {
    const t = topicOf(q.text);
    if (t) byTopic.set(t, [...(byTopic.get(t) ?? []), q]);
  }
  const [top] = [...byTopic].sort((a, b) => b[1].length - a[1].length);
  if (!top || top[1].length < CONFUSION_THRESHOLD) return null;
  return { topic: top[0], questions: top[1] };
}

export function queueSpike(checkins: Checkin[]) {
  const real = checkins.filter((c) => !c.duplicate);
  return real.length >= QUEUE_THRESHOLD ? { count: real.length } : null;
}

/** The room a report mentions, by name or by its number ("Lab 204", "204", "seminar hall 3"). */
export function roomIn(text: string, rooms: Room[]): Room | undefined {
  const t = text.toLowerCase();
  return (
    rooms.find((r) => t.includes(r.name.toLowerCase())) ??
    rooms.find((r) => {
      const num = /\d{2,}/.exec(r.name)?.[0];
      return num !== undefined && new RegExp(`\\b${num}\\b`).test(t);
    })
  );
}

const AV = /\b(projector|screen|mic|microphone|speaker|sound|audio|hdmi|display|laptop)\b/i;
const FACILITY = /\b(ac|fan|light|power|socket|water|leak|door|chair)\b/i;
const MEDICAL = /\b(faint|injur|bleed|chest|ambulance|doctor|medical|behosh)\w*/i;
const FIRE = /\b(fire|smoke|aag|dhuaan)\b/i;

/** Category and the skill that fixes it. Medical and fire are emergencies: Radar only alerts people. */
export function classify(text: string): {
  category: "av" | "facilities" | "medical" | "fire" | "it";
  skill: string;
} {
  if (FIRE.test(text)) return { category: "fire", skill: "crowd" };
  if (MEDICAL.test(text)) return { category: "medical", skill: "first_aid" };
  if (AV.test(text)) return { category: "av", skill: "av_tech" };
  if (FACILITY.test(text)) return { category: "facilities", skill: "runner" };
  return { category: "it", skill: "av_tech" };
}

/** Ten-minute bucket, so one situation gives one set of proposals however many events report it. */
export const bucket = (iso: string, minutes: number) =>
  Math.floor(Date.parse(iso) / (minutes * 60_000)).toString(36);
