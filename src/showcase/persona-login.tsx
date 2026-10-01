"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Gavel,
  LayoutDashboard,
  LoaderCircle,
  Mic,
  ScanLine,
  ShieldCheck,
  Ticket,
  type LucideIcon,
} from "lucide-react";
import type { DemoPersona } from "@/contracts/api";
import { Reveal } from "@/components/ui";
import { cn } from "@/lib/utils";
import { setLedger } from "./store";

type Door = { id: string; persona: DemoPersona; title: string; hint: string; icon: LucideIcon; home: string };

/**
 * Showcase sign-in: pick who to be. No email, no code, no bot check: the persona lives in this browser
 * and every screen answers for it from the recorded event.
 */
export function PersonaLogin({ next, eventId }: { next: string; eventId: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const stage = `/console/${eventId}`;
  const doors: Door[] = [
    {
      id: "owner",
      persona: "owner",
      title: "Event head",
      hint: "Run the console: fire a disruption, watch the agents, approve their plans.",
      icon: LayoutDashboard,
      home: stage,
    },
    {
      id: "faculty",
      persona: "faculty",
      title: "Faculty approver",
      hint: "Dr. Srinivasa Rao gives the second sign-off that official, bulk changes need.",
      icon: ShieldCheck,
      home: stage,
    },
    {
      id: "volunteer",
      persona: "volunteer",
      title: "Ravi Kumar, volunteer",
      hint: "The crew app: shift, tasks and offline ticket scanning.",
      icon: ScanLine,
      home: "/crew",
    },
    {
      id: "attendee",
      persona: "attendee",
      title: "Sneha Reddy, attendee",
      hint: "Her ticket, her schedule and the helpdesk that answers with sources.",
      icon: Ticket,
      home: "/me",
    },
    {
      id: "speaker",
      persona: "viewer",
      title: "Lakshmi Prasad, speaker",
      hint: "Her phone: the message that reaches her when her session moves. Read only.",
      icon: Mic,
      home: `${stage}/speaker`,
    },
    {
      id: "viewer",
      persona: "viewer",
      title: "Judge view",
      hint: "The whole console, read only.",
      icon: Gavel,
      home: stage,
    },
  ];

  const choose = (d: Door) => {
    setBusy(d.id);
    setLedger((l) => ({ ...l, persona: d.persona }));
    // A deep link from the same area wins over the persona's home page.
    const area = d.home.split("/")[1];
    router.replace(d.id !== "speaker" && next.split("/")[1] === area && next !== "/" ? next : d.home);
    router.refresh();
  };

  return (
    <section aria-labelledby="persona-title" className="flex flex-col gap-4">
      <Reveal className="flex flex-col gap-1">
        <h2 id="persona-title" className="kicker text-fg-muted">
          Choose who to be
        </h2>
        <p className="text-sm text-fg-muted">
          This is a recorded run of HackNova 2026. Pick a person to see the event through their eyes.
        </p>
      </Reveal>
      <div className="grid gap-3">
        {doors.map((d, i) => {
          const lead = d.id === "owner";
          const Icon = d.icon;
          return (
            <Reveal key={d.id} index={i + 1}>
              <button
                type="button"
                aria-describedby={`door-${d.id}-hint`}
                aria-busy={busy === d.id || undefined}
                disabled={busy !== null}
                onClick={() => choose(d)}
                className={cn(
                  "group spot spot-edge lift press flex w-full items-center gap-4 rounded-card border bg-surface p-4 text-left text-fg depth-1",
                  "disabled:cursor-not-allowed disabled:not-aria-busy:opacity-55 aria-busy:cursor-progress",
                  lead ? "border-curtain-text/50" : "border-border",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-inner [&_svg]:size-5",
                    lead ? "bg-curtain text-on-curtain" : "bg-surface-sunken text-fg",
                  )}
                >
                  {busy === d.id ? <LoaderCircle className="animate-spin" /> : <Icon />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-medium">
                    {d.title}
                    {lead ? (
                      <span className="rounded-full bg-curtain-soft px-2 py-0.5 font-mono text-xs tracking-[0.12em] text-curtain-soft-fg uppercase">
                        Start here
                      </span>
                    ) : null}
                  </span>
                  <span id={`door-${d.id}-hint`} className="text-sm text-fg-muted">
                    {d.hint}
                  </span>
                </span>
                <ArrowRight
                  aria-hidden
                  className="size-4 shrink-0 text-fg-muted group-hover:text-fg motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5"
                />
              </button>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
