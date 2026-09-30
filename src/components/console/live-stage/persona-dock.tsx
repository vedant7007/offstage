"use client";

import * as React from "react";
import type { PersonaFeedResponse } from "@/contracts";
import { api } from "@/lib/api-client";
import { formatTime } from "@/lib/time";
import { Badge } from "@/components/ui";
import { DOCK_CHANNEL as CHANNEL, DOCK_STATUS as STATUS, PHONE } from "./theme";

type Persona = PersonaFeedResponse["personas"][number];

const POLL_MS = 3000;

function Phone({ p }: { p: Persona }) {
  const listRef = React.useRef<HTMLOListElement>(null);
  const last = p.items.at(-1)?.id;
  React.useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [last]);
  return (
    <section aria-label={`What ${p.name} sees`} className={PHONE.frame}>
      <header className={PHONE.header}>
        <span aria-hidden className="mb-1 h-1.5 w-12 rounded-full bg-border" />
        <span className="text-sm font-semibold">{p.name}</span>
        <span className="text-xs text-fg-muted">
          {p.role}
          {p.phone ? <span className="tabular-nums">, {p.phone}</span> : null}
        </span>
      </header>
      <ol ref={listRef} aria-live="polite" className={PHONE.screen}>
        {p.items.length ? (
          p.items.map((m) => {
            const c = CHANNEL[m.channel] ?? CHANNEL.in_app!;
            const st = m.channel === "task" ? undefined : STATUS[m.status];
            return (
              <li key={m.id} className={PHONE.bubble}>
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
