// Radar's detectors. Pure code over read data, so a spike is found the same way with or without a model.

import type { Checkin, Room } from "@/contracts";
import type { HelpdeskQuestion } from "@/agents/runtime/services";

/** Topics people get confused about on the day, in English and Hinglish. */
export const TOPICS = [
  {
    key: "food",
    label: "lunch and food",
    query: "where and when is lunch served today",
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
const MEDICAL =
  /\b(faint|injur|bleed|chest|ambulance|doctor|medical|behosh|collaps|unconscious|breath|seizure|heart attack|allerg|first aid|chakkar|hosh)\w*/i;
const FIRE = /\b(fire|smoke|aag|dhuaan|burning|sparks|short circuit)\b/i;
const HARASSMENT = /\b(harass|molest|stalk|grop|eve.?teas|chhed)\w*/i;
const SAFETY = /\b(fight|stampede|crush|weapon|knife|violen|threat|jhagd|maar ?peet|bhagdad)\w*/i;
// Hindi script: \b does not work on Devanagari, so these match anywhere.
const FIRE_HI = /आग|धुआ|धुँआ/;
const MEDICAL_HI = /बेहोश|खून|एम्बुलेंस|डॉक्टर|दौरा|सांस|साँस|चक्कर|गिर (गया|गई|गयी)/;
const HARASSMENT_HI = /छेड़|छेड|परेशान कर/;
const SAFETY_HI = /झगड़|झगड|मारपीट|भगदड़|भगदड/;

/**
 * Category and the skill that fixes it. Medical, fire, harassment and safety are emergencies: Radar
 * only alerts people. Emergencies are checked first, so "fainted next to the projector" is medical.
 */
export function classify(text: string): {
  category: "av" | "facilities" | "medical" | "fire" | "harassment" | "safety" | "it";
  skill: string;
} {
  if (FIRE.test(text) || FIRE_HI.test(text)) return { category: "fire", skill: "crowd" };
  if (MEDICAL.test(text) || MEDICAL_HI.test(text)) return { category: "medical", skill: "first_aid" };
  if (HARASSMENT.test(text) || HARASSMENT_HI.test(text)) return { category: "harassment", skill: "crowd" };
  if (SAFETY.test(text) || SAFETY_HI.test(text)) return { category: "safety", skill: "crowd" };
  if (AV.test(text)) return { category: "av", skill: "av_tech" };
  if (FACILITY.test(text)) return { category: "facilities", skill: "runner" };
  return { category: "it", skill: "av_tech" };
}

/** Ten-minute bucket, so one situation gives one set of proposals however many events report it. */
export const bucket = (iso: string, minutes: number) =>
  Math.floor(Date.parse(iso) / (minutes * 60_000)).toString(36);
