// What-if simulator. The scenario becomes perturbations (by rules; the model is not needed for the phrasings
// organizers use), they are applied to a deep copy of the event, impacts are computed in code, and the agents
// that own the problem re-plan in simulation mode, so their proposals come back "simulated" and nothing real
// changes. Blueprint section 5, "Commander extras".

import type { Domain, WhatIfPerturbation, WhatIfResult } from "@/contracts";
import type { EventWorld } from "@/contracts/fixtures";
import { spentBy } from "@/agents/finance/config";
import { replanOptions } from "@/solvers/schedule";
import { istDateKey, istToUtc } from "@/lib/time";

type Impact = WhatIfResult["impacts"][number];

/** "50k", "1.5 lakh", "50,000" to rupees. */
function amount(s: string): number | undefined {
  const m = /(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|lakh|lakhs|l|cr|crore)?\b/i.exec(s);
  if (!m) return undefined;
  const n = Number(m[1]!.replace(/,/g, ""));
  const unit = m[2]?.toLowerCase();
  const mult =
    unit === "k" || unit === "thousand"
      ? 1e3
      : unit?.startsWith("l")
        ? 1e5
        : unit?.startsWith("cr")
          ? 1e7
          : 1;
  return Math.round(n * mult);
}

/** Reads the usual phrasings. Assumptions it had to make are returned so the console can show them. */
export function parseScenario(text: string, w: EventWorld) {
  const t = text.toLowerCase();
  const out: WhatIfPerturbation[] = [];
  const assumptions: { label: string; value: string }[] = [];

  const pct = /(\d{1,3})\s*%\s*(more|fewer|less)/.exec(t);
  if (pct)
    out.push({
      type: "attendance_multiplier",
      value: 1 + (pct[2] === "more" ? 1 : -1) * (Number(pct[1]) / 100),
    });
  else if (/\b(double|twice)\b/.test(t) && /(people|attend|crowd|register)/.test(t))
    out.push({ type: "attendance_multiplier", value: 2 });

  const weather = /\b(rain|storm|heat|heatwave)\b/.exec(t);
  if (weather)
    out.push({
      type: "weather",
      value: weather[1] === "heatwave" ? "heat" : (weather[1] as "rain" | "storm" | "heat"),
    });

  if (/(speaker|keynote).*(cancel|drop|can't|cannot|not come|no[- ]show)|cancel.*(speaker|keynote)/.test(t)) {
    const named = w.speakers.find(
      (s) => t.includes(s.name.toLowerCase()) || t.includes(s.name.split(" ").at(-1)!.toLowerCase()),
    );
    const keynote = w.sessions
      .filter((s) => s.kind === "keynote" && s.status !== "cancelled")
      .sort((a, b) => b.registeredCount - a.registeredCount)[0];
    const speakerId = named?.id ?? keynote?.speakerIds[0];
    if (speakerId) {
      out.push({ type: "speaker_cancel", speakerId });
      if (!named)
        assumptions.push({
          label: "Main speaker",
          value: w.speakers.find((s) => s.id === speakerId)?.name ?? speakerId,
        });
    }
  }

  if (/budget/.test(t) && /(drop|cut|reduc|down|less|lose|shrink|increase|up|more)/.test(t)) {
    const a = amount(t);
    if (a) out.push({ type: "budget_delta", amountInr: /(increase|up|more)/.test(t) ? a : -a });
  }

  const lost = /(lose|lost|unavailable|closed|not available|flood)/.test(t)
    ? w.rooms.find((r) => t.includes(r.name.toLowerCase()))
    : undefined;
  if (lost) out.push({ type: "room_loss", roomId: lost.id });

  const shift = /(postpone|delay|push|move|prepone|earlier).*?(\d{1,2})\s*days?/.exec(t);
  if (shift)
    out.push({ type: "date_shift", days: (/(prepone|earlier)/.test(t) ? -1 : 1) * Number(shift[2]) });

  return { perturbations: out, assumptions };
}

const capOf = (w: EventWorld, s: EventWorld["sessions"][number]) =>
  s.capacity ?? w.rooms.find((r) => r.id === s.roomId)?.capacity ?? Infinity;

/** Applies the perturbations to `w` in place. Call it on a copy. */
export function applyPerturbations(w: EventWorld, ps: WhatIfPerturbation[]): void {
  for (const p of ps) {
    if (p.type === "attendance_multiplier")
      for (const s of w.sessions) s.registeredCount = Math.round(s.registeredCount * p.value);
    if (p.type === "speaker_cancel")
      for (const s of w.sessions)
        if (s.speakerIds.includes(p.speakerId) && s.status !== "cancelled") s.status = "cancelled";
    if (p.type === "budget_delta") {
      const total = w.budgetCategories.reduce((a, c) => a + c.capInr, 0);
      const k = Math.max(0, (total + p.amountInr) / total);
      for (const c of w.budgetCategories) c.capInr = Math.round((c.capInr * k) / 1000) * 1000;
    }
  }
}

/** Impacts per domain, before and after, all computed from the two worlds. */
export function impactsOf(before: EventWorld, after: EventWorld, ps: WhatIfPerturbation[]): Impact[] {
  const out: Impact[] = [];
  const today = istDateKey(before.now);
  const confirmed = before.registrations.filter((r) => r.status === "confirmed").length;
  for (const p of ps) {
    if (p.type === "attendance_multiplier") {
      const over = (w: EventWorld) =>
        w.sessions.filter((s) => s.status !== "cancelled" && s.registeredCount > capOf(w, s));
      const short = (w: EventWorld) => over(w).reduce((a, s) => a + s.registeredCount - capOf(w, s), 0);
      const expected = Math.round(confirmed * p.value);
      const desk = Math.max(
        1,
        before.volunteers.filter((v) => v.active && v.skills.includes("registration_desk")).length,
      );
      const catering = before.budgetCategories.find((c) => c.key === "catering");
      const spent = catering ? (spentBy(before.ledgerEntries).get(catering.id) ?? 0) : 0;
      out.push(
        {
          domain: "registrations",
          summary: `${expected} people instead of ${confirmed}.`,
          metrics: [{ label: "Expected attendees", before: confirmed, after: expected }],
        },
        {
          domain: "schedule",
          summary: `${over(after).length} sessions would have more people than seats (${short(after)} seats short).`,
          metrics: [
            { label: "Sessions over capacity", before: over(before).length, after: over(after).length },
            { label: "Seats short", before: short(before), after: short(after) },
          ],
        },
        {
          domain: "crew",
          summary: `Each registration desk volunteer would check in about ${Math.round(expected / desk)} people.`,
          metrics: [
            {
              label: "Check-ins per desk volunteer",
              before: Math.round(confirmed / desk),
              after: Math.round(expected / desk),
            },
          ],
        },
        ...(catering
          ? [
              {
                domain: "finance" as Domain,
                summary: `Catering would need about ${Math.round(spent * p.value)} INR against a cap of ${catering.capInr} INR.`,
                metrics: [
                  { label: "Catering spend", before: spent, after: Math.round(spent * p.value), unit: "INR" },
                ],
              },
            ]
          : []),
      );
    }
    if (p.type === "weather") {
      const outdoor = new Set(before.rooms.filter((r) => r.kind === "outdoor").map((r) => r.id));
      const hit = before.sessions.filter(
        (s) => s.status !== "cancelled" && s.roomId && outdoor.has(s.roomId),
      );
      const people = hit.reduce((a, s) => a + s.registeredCount, 0);
      out.push({
        domain: "logistics",
        summary: hit.length
          ? `${hit.length} sessions in outdoor spaces (${people} people) need an indoor room or cover.`
          : `No sessions are outdoors. Plan for ${p.value === "rain" || p.value === "storm" ? "wet entrances, umbrellas at the desk and a late start" : "water points and shade in queues"}.`,
        metrics: [{ label: "Outdoor sessions affected", before: 0, after: hit.length }],
      });
    }
    if (p.type === "speaker_cancel") {
      const lostSessions = after.sessions.filter(
        (s) =>
          s.speakerIds.includes(p.speakerId) &&
          before.sessions.find((b) => b.id === s.id)?.status !== "cancelled",
      );
      const people = lostSessions.reduce((a, s) => a + s.registeredCount, 0);
      out.push({
        domain: "schedule",
        summary: `${lostSessions.length} sessions lose their speaker; ${people} registered people are affected.`,
        metrics: [
          { label: "Sessions cancelled", before: 0, after: lostSessions.length },
          { label: "People affected", before: 0, after: people },
        ],
      });
    }
    if (p.type === "budget_delta") {
      const spent = spentBy(before.ledgerEntries);
      const over = (w: EventWorld) => w.budgetCategories.filter((c) => (spent.get(c.id) ?? 0) > c.capInr);
      const total = (w: EventWorld) => w.budgetCategories.reduce((a, c) => a + c.capInr, 0);
      out.push({
        domain: "finance",
        summary: `Budget ${p.amountInr < 0 ? "falls" : "rises"} to ${total(after)} INR; ${over(after).length} ${over(after).length === 1 ? "category" : "categories"} would already be over the new cap.`,
        metrics: [
          { label: "Total budget", before: total(before), after: total(after), unit: "INR" },
          { label: "Categories over cap", before: over(before).length, after: over(after).length },
        ],
      });
    }
    if (p.type === "room_loss") {
      const room = before.rooms.find((r) => r.id === p.roomId);
      const inRoom = before.sessions.filter(
        (s) => s.roomId === p.roomId && s.status !== "cancelled" && istDateKey(s.startsAt) === today,
      );
      const best = replanOptions(
        { sessions: before.sessions, rooms: before.rooms },
        { type: "room_loss", roomId: p.roomId },
        {
          dayStart: istToUtc(`${today}T08:00`).toISOString(),
          dayEnd: istToUtc(`${today}T20:00`).toISOString(),
        },
      )[0];
      out.push({
        domain: "schedule",
        summary: best
          ? `${inRoom.length} sessions today use ${room?.name ?? "the room"}. Best option: ${best.label}.`
          : `${inRoom.length} sessions today use ${room?.name ?? "the room"}; no free room fits them all.`,
        metrics: [
          { label: "Sessions to move", before: 0, after: inRoom.length },
          { label: "Seats short after the move", before: 0, after: best?.metrics.capacityShortfall ?? 0 },
        ],
      });
    }
    if (p.type === "date_shift") {
      const shifted = (d: string) =>
        istDateKey(new Date(Date.parse(`${d}T12:00:00+05:30`) + p.days * 86_400_000));
      const open = before.milestones.filter((m) => m.status !== "done" && m.status !== "skipped");
      const overdue = (due: (m: (typeof open)[number]) => string) =>
        open.filter((m) => due(m) < today).length;
      out.push({
        domain: "planning",
        summary: `Every date moves by ${p.days} days; milestones move with the event.`,
        metrics: [
          {
            label: "Overdue milestones",
            before: overdue((m) => m.dueOn),
            after: overdue((m) => shifted(m.dueOn)),
          },
        ],
      });
    }
  }
  return out;
}
