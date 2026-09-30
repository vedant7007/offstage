"use client";

import { cn } from "@/lib/utils";
import { CalendarDays, HandHelping, IndianRupee, Lock, Send, Ticket, Undo2, Users } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { formatInr } from "@/lib/format";
import { InfoChip } from "./chip";

/** Keys match Channel in src/contracts. */
export type ChannelKey = "in_app" | "email" | "telegram" | "whatsapp" | "sms";

/** Same shape as ActionProposal.impact in src/contracts. */
export type Impact = {
  people: number;
  attendees: number;
  volunteers: number;
  sessions: number;
  moneyInr?: number;
  channels: ChannelKey[];
  reversible: boolean;
};

/** Who and what a proposal touches. Zero counts are left out; reversibility is always shown. */
function ImpactChips({ impact, className }: { impact: Impact; className?: string }) {
  const t = useT();
  const counts = [
    { key: "people", value: impact.people, icon: <Users aria-hidden /> },
    { key: "attendees", value: impact.attendees, icon: <Ticket aria-hidden /> },
    { key: "volunteers", value: impact.volunteers, icon: <HandHelping aria-hidden /> },
    { key: "sessions", value: impact.sessions, icon: <CalendarDays aria-hidden /> },
  ] as const;

  return (
    <ul aria-label={t("impact.label")} className={cn("flex flex-wrap gap-2", className)}>
      {counts
        .filter((c) => c.value > 0)
        .map((c) => (
          <li key={c.key}>
            <InfoChip icon={c.icon}>{t(`impact.${c.key}`, { count: c.value })}</InfoChip>
          </li>
        ))}
      {impact.moneyInr ? (
        <li>
          <InfoChip icon={<IndianRupee aria-hidden />} className="tabular-nums">
            {t("impact.money", { amount: formatInr(impact.moneyInr) })}
          </InfoChip>
        </li>
      ) : null}
      {impact.channels.length ? (
        <li>
          <InfoChip icon={<Send aria-hidden />}>
            {t("impact.channels", { list: impact.channels.map((c) => t(`channel.${c}`)).join(", ") })}
          </InfoChip>
        </li>
      ) : null}
      <li>
        <InfoChip
          tone={impact.reversible ? "approved" : "pending"}
          icon={impact.reversible ? <Undo2 aria-hidden /> : <Lock aria-hidden />}
        >
          {impact.reversible ? t("impact.reversible") : t("impact.irreversible")}
        </InfoChip>
      </li>
    </ul>
  );
}

export { ImpactChips };
