"use client";

import * as React from "react";
import type { PersonaFeedResponse } from "@/contracts/api";
import { PageHeader } from "@/components/ui";
import { Phone } from "@/components/console/live-stage/persona-dock";
import { PHONE } from "@/components/console/live-stage/theme";
import { api } from "@/lib/api-client";
import { formatTime } from "@/lib/time";
import { onMessage } from "./bus";
import { loadScenario, WORLD } from "./data";
import { clockOffset, getLedger } from "./store";

type Persona = PersonaFeedResponse["personas"][number];

/** Lakshmi's messages as recorded when her session moved, for a visitor who has not played that yet. */
async function recorded(): Promise<Persona | undefined> {
  const s = await loadScenario("speaker_cancel");
  for (const phase of [...s.phases].reverse())
    for (const [k, v] of Object.entries(phase.responses))
      if (k.startsWith("persona:viewer personaFeed ")) {
        const p = (v as PersonaFeedResponse).personas.find((x) => x.key === "speaker");
        if (p?.items.length) return p;
      }
  return undefined;
}

/**
 * The speaker's side of the event. Speakers have no app login in OFFSTAGE: the team reaches them by
 * email and chat, so her view is her phone. Live from this demo when it has sent her something,
 * otherwise the messages the recorded run sent her.
 */
export function SpeakerView({ eventId }: { eventId: string }) {
  const [phone, setPhone] = React.useState<{ p: Persona; live: boolean } | null>(null);
  const [time, setTime] = React.useState("");

  React.useEffect(() => {
    let on = true;
    const load = async () => {
      const feed = await api.call("personaFeed", { params: { eventId } }).catch(() => null);
      const mine = feed?.personas.find((x) => x.key === "speaker");
      const p = mine?.items.length ? mine : await recorded();
      if (on && p) setPhone({ p, live: p === mine });
    };
    void load();
    const tick = () =>
      setTime(formatTime(Date.now() + clockOffset(getLedger(), WORLD.demoClock)).replace(/ [AP]M$/, ""));
    tick();
    const clock = setInterval(tick, 1000);
    // A message to her arrives as an outbox change on the recorded stream.
    const off = onMessage((m) => {
      if (m.type === "outbox" || m.type === "proposal") void load();
    });
    return () => {
      on = false;
      clearInterval(clock);
      off();
    };
  }, [eventId]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Speaker"
        title="Lakshmi Prasad"
        description="Speakers do not sign in to OFFSTAGE. When a plan changes their session, the approved message reaches them by email and chat. This is her phone."
      />
      <section aria-labelledby="speaker-phone" className={PHONE.band}>
        <div className={PHONE.head}>
          <div className="flex flex-col gap-1">
            <h2 id="speaker-phone" className="text-lg font-medium tracking-[-0.02em]">
              Her messages
            </h2>
            <p className="text-sm text-fg-muted" aria-live="polite">
              {phone && !phone.live
                ? "From the recorded run, when the keynote speaker cancelled and her session moved. Sign in as the Event head and play Keynote speaker cancels to send it live."
                : "Live from this demo."}
            </p>
          </div>
        </div>
        <div className="flex justify-center border-t border-white/10 px-5 pt-10 pb-14">
          {phone ? (
            <Phone p={phone.p} time={time} fresh={new Set()} />
          ) : (
            <p className="text-sm text-fg-muted">Loading her phone...</p>
          )}
        </div>
      </section>
    </div>
  );
}
