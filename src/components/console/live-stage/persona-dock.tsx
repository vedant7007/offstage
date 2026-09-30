"use client";

import * as React from "react";
import type { PersonaFeedResponse } from "@/contracts";
import { api } from "@/lib/api-client";
import { formatTime } from "@/lib/time";
import { Badge, type Tone } from "@/components/ui";

type Persona = PersonaFeedResponse["personas"][number];

const CHANNEL: Record<string, { label: string; tone: Tone }> = {
  in_app: { label: "In-app", tone: "neutral" },
  email: { label: "Email", tone: "info" },
  sms: { label: "SMS", tone: "info" },
  whatsapp: { label: "WhatsApp", tone: "approved" },
  telegram: { label: "Telegram", tone: "agent" },
  task: { label: "Task", tone: "pending" },
};
/** Always a word next to the tick, never the tick alone. */
const STATUS: Record<string, { tick: string; label: string; className: string }> = {
  queued: { tick: "○", label: "Queued", className: "text-fg-muted" },
  delivered: { tick: "✓✓", label: "Delivered", className: "text-approved-text" },
  delivered_mock: { tick: "✓", label: "Delivered (mock)", className: "text-fg-muted" },
  read: { tick: "✓✓", label: "Read", className: "text-info-text" },
  failed: { tick: "✕", label: "Failed", className: "text-danger-text" },
};
const POLL_MS = 3000;

function Phone({ p }: { p: Persona }) {
  const listRef = React.useRef<HTMLOListElement>(null);
  const last = p.items.at(-1)?.id;
  React.useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [last]);
  return (
    <section
      aria-label={`What ${p.name} sees`}
      className="flex h-[26rem] w-full max-w-[17rem] flex-col overflow-hidden rounded-[2rem] border-[6px] border-fg bg-surface shadow-lg"
    >
      <header className="flex flex-col items-center gap-0.5 border-b border-border bg-surface-raised px-3 pt-2 pb-2">
        <span aria-hidden className="mb-1 h-1.5 w-12 rounded-full bg-border" />
        <span className="text-sm font-semibold">{p.name}</span>
        <span className="text-xs text-fg-muted">
          {p.role}
          {p.phone ? <span className="tabular-nums">, {p.phone}</span> : null}
        </span>
      </header>
      <ol
        ref={listRef}
        aria-live="polite"
        className="flex flex-1 flex-col gap-2 overflow-y-auto bg-surface-sunken p-2"
      >
        {p.items.length ? (
          p.items.map((m) => {
            const c = CHANNEL[m.channel] ?? CHANNEL.in_app!;
            const st = m.channel === "task" ? undefined : STATUS[m.status];
            return (
              <li
                key={m.id}
                className="mr-4 rounded-card rounded-tl-none border border-border bg-surface p-2 text-xs"
              >
                <div className="mb-1 flex flex-wrap items-center gap-1">
                  <Badge tone={c.tone}>{c.label}</Badge>
                  {m.channel === "task" ? <Badge tone="neutral">{m.status}</Badge> : null}
                </div>
                {m.title ? <p className="font-semibold">{m.title}</p> : null}
                <p className="whitespace-pre-wrap">{m.body}</p>
                <p className="mt-1 flex justify-end gap-1 text-[0.7rem] text-fg-muted tabular-nums">
                  <span>{formatTime(m.at)}</span>
                  {st ? (
                    <span className={st.className}>
                      <span aria-hidden>{st.tick}</span> {st.label}
                    </span>
                  ) : m.channel !== "task" ? (
                    <span>{m.status}</span>
                  ) : null}
                </p>
              </li>
            );
          })
        ) : (
          <li className="m-auto text-center text-xs text-fg-muted">Nothing yet</li>
        )}
      </ol>
    </section>
  );
}

/**
 * "See what they see": the attendee, a volunteer and a speaker, as their phones would show it. Refetches
 * when the console stream says a message moved (`tick`), and polls every 3 seconds while the stream is down.
 */
export function PersonaDock({ eventId, tick, live }: { eventId: string; tick: number; live: boolean }) {
  const [personas, setPersonas] = React.useState<Persona[] | null>(null);
  const load = React.useCallback(
    () =>
      api.call("personaFeed", { params: { eventId } }).then(
        (r) => setPersonas(r.personas),
        () => undefined,
      ),
    [eventId],
  );
  // A burst of stream messages becomes one fetch.
  React.useEffect(() => {
    const id = setTimeout(() => void load(), tick ? 400 : 0);
    return () => clearTimeout(id);
  }, [load, tick]);
  React.useEffect(() => {
    if (live) return;
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
  }, [load, live]);

  if (personas && !personas.length) return null; // not in demo mode
  return (
    <details open className="group rounded-card border border-border bg-surface">
      <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">
        See what they see
        <span className="ml-2 font-normal text-fg-muted group-open:hidden">(show the phones)</span>
      </summary>
      <div className="grid justify-items-center gap-4 border-t border-border p-3 sm:grid-cols-2 lg:grid-cols-3">
        {personas ? (
          personas.map((p) => <Phone key={p.key} p={p} />)
        ) : (
          <p className="text-sm text-fg-muted">Loading the phones</p>
        )}
      </div>
    </details>
  );
}
