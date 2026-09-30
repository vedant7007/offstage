// Logistics arithmetic: food counts per preference and the readiness items a room move adds.

import type { Checklist, FoodCount, FoodPref, Session } from "@/contracts";

export type Counts = Pick<FoodCount, "veg" | "nonVeg" | "vegan" | "jain" | "other">;

/** One plate per confirmed registration, by food preference. "none" counts as other. */
export function foodCounts(prefs: FoodPref[]): Counts {
  const c: Counts = { veg: 0, nonVeg: 0, vegan: 0, jain: 0, other: 0 };
  for (const p of prefs) {
    if (p === "non_veg") c.nonVeg++;
    else if (p === "none") c.other++;
    else c[p]++;
  }
  return c;
}

export const sameCounts = (a: Counts, b: Counts) =>
  a.veg === b.veg && a.nonVeg === b.nonVeg && a.vegan === b.vegan && a.jain === b.jain && a.other === b.other;

type Item = {
  itemId?: string;
  label: string;
  status: "todo" | "in_progress" | "done" | "blocked";
  notes?: string;
};

/**
 * Items a checklist should gain, with the existing ones kept first so an update never drops any. Returns null
 * when every label is already there (the move was handled).
 */
export function withItems(list: Checklist | undefined, add: Item[]): Item[] | null {
  const have = new Set(list?.items.map((i) => i.label) ?? []);
  const fresh = add.filter((i) => !have.has(i.label));
  if (!fresh.length) return null;
  const kept = (list?.items ?? []).map(({ id, label, status, notes }) => ({
    itemId: id,
    label,
    status,
    ...(notes ? { notes } : {}),
  }));
  return [...kept, ...fresh].slice(0, 100);
}

/** Readiness items for a session that just moved into a room, and the redirect sign for the old one. */
export function moveItems(session: Session, newRoom: { name: string; capacity: number }, time: string) {
  const t = session.title.slice(0, 80);
  const tight = session.registeredCount > newRoom.capacity;
  return {
    newRoom: [
      { label: `AV check before "${t}" at ${time}`, status: "todo" as const },
      {
        label: `Seating and door signage for "${t}"`,
        status: "todo" as const,
        ...(tight
          ? {
              notes: `${session.registeredCount} registered, room seats ${newRoom.capacity}. Arrange extra seating.`,
            }
          : {}),
      },
    ],
    oldRoom: [{ label: `Sign at the door: "${t}" moved to ${newRoom.name}`, status: "todo" as const }],
  };
}
