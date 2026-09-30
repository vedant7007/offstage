// Which confirmed speakers still owe their requirements for a session starting soon.

import type { Session } from "@/contracts";
import type { SpeakerRosterEntry } from "@/agents/runtime/services";

export const WINDOW_HOURS = 48;
/** Reminder offsets before session start, in minutes; only those still ahead are kept. */
const OFFSETS = [1440, 120, 30];

export function pendingRequirements(roster: SpeakerRosterEntry[], sessions: Session[], now: string) {
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const until = Date.parse(now) + WINDOW_HOURS * 3_600_000;
  const out: { speaker: SpeakerRosterEntry; session: Session; offsetsMinutes: number[] }[] = [];
  for (const sp of roster) {
    if (sp.status !== "confirmed" || sp.requirementsSubmitted) continue;
    // One reminder schedule per speaker, for their earliest upcoming session: requirements cover all of them.
    const s = sp.sessionIds
      .map((id) => byId.get(id))
      .filter(
        (x): x is Session =>
          !!x && x.status !== "cancelled" && x.startsAt > now && Date.parse(x.startsAt) <= until,
      )
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
    if (!s) continue;
    const minsLeft = (Date.parse(s.startsAt) - Date.parse(now)) / 60_000;
    const offsetsMinutes = OFFSETS.filter((o) => o < minsLeft);
    if (offsetsMinutes.length) out.push({ speaker: sp, session: s, offsetsMinutes });
  }
  return out;
}
