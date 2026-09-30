// Which milestones need attention, by IST calendar date. Done and skipped ones never do.

import type { Milestone } from "@/contracts";

/** Not started and due within this many days counts as at risk. */
export const AT_RISK_DAYS = 2;

const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

export type MilestoneRisk = { milestone: Milestone; state: "overdue" | "at_risk"; days: number };

/** `today` is the IST date key ("YYYY-MM-DD"). `days` is days late (overdue) or days left (at risk). */
export function milestoneRisks(milestones: Milestone[], today: string): MilestoneRisk[] {
  const out: MilestoneRisk[] = [];
  for (const m of milestones) {
    if (m.status === "done" || m.status === "skipped") continue;
    const left = days(today, m.dueOn);
    if (left < 0) out.push({ milestone: m, state: "overdue", days: -left });
    else if (m.status === "blocked" || (m.status === "not_started" && left <= AT_RISK_DAYS))
      out.push({ milestone: m, state: "at_risk", days: left });
  }
  return out.sort((a, b) => a.milestone.dueOn.localeCompare(b.milestone.dueOn));
}
