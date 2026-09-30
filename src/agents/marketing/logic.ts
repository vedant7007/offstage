// Funnel maths for Marketing: how far behind target, and which colleges and departments are thin.

import type { FunnelSnapshot, RegistrationSummary } from "@/contracts";

/** Push when registrations are this far behind the day's target. */
export const BEHIND_RATIO = 0.2;

export function latestGap(funnel: FunnelSnapshot[]) {
  const last = [...funnel].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  if (!last || last.target <= 0) return null;
  const behind = (last.target - last.registrations) / last.target;
  return { snapshot: last, behind };
}

/**
 * Groups (colleges or departments) with fewer registrations than an equal share, smallest first. A
 * naive heuristic: without college sizes we cannot tell a small college from a quiet one.
 */
export function underRepresented(
  regs: RegistrationSummary[],
  by: "college" | "department",
  n = 3,
): { name: string; count: number; share: number }[] {
  const live = regs.filter((r) => r.status === "confirmed" || r.status === "waitlisted");
  const counts = new Map<string, number>();
  for (const r of live) counts.set(r[by], (counts.get(r[by]) ?? 0) + 1);
  if (counts.size < 2) return [];
  const fair = live.length / counts.size;
  return [...counts]
    .filter(([, c]) => c < fair)
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([name, count]) => ({ name, count, share: count / live.length }));
}
