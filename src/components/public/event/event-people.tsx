import { ChevronDown } from "lucide-react";
import type { PublicEventResponse } from "@/contracts";
import { Avatar } from "@/components/ui";
import { getT } from "@/lib/i18n/server";
import { Kicker } from "@/components/public/kicker";

type Props = { data: PublicEventResponse; cue: string };

export async function Speakers({ data, cue }: Props) {
  const t = await getT();
  if (!data.speakers.length) return null;
  const sessions = new Map(data.sessions.map((s) => [s.id, s.title]));
  return (
    <section aria-labelledby="speakers-title" className="flex flex-col gap-4">
      <Kicker>{cue}</Kicker>
      <h2 id="speakers-title" className="text-2xl md:text-3xl">
        {t("event.speakersTitle")}
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.speakers.map((sp) => (
          <li key={sp.id} className="flex gap-3 rounded-card border border-border bg-surface p-5 shadow-card">
            <Avatar name={sp.name} decorative />
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="font-medium tracking-[-0.015em]">{sp.name}</p>
              {sp.title || sp.organization ? (
                <p className="text-sm text-fg-muted">
                  {[sp.title, sp.organization].filter(Boolean).join(", ")}
                </p>
              ) : null}
              {sp.sessionIds.length ? (
                <ul className="mt-2 flex flex-col gap-1 border-t border-border pt-2 text-sm">
                  {sp.sessionIds.map((id) =>
                    sessions.get(id) ? <li key={id}>{sessions.get(id)}</li> : null,
                  )}
                </ul>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** FAQ from the knowledge base seeds. Native details elements, so it works without JavaScript. */
export async function Faq({ data, cue }: Props) {
  const t = await getT();
  if (!data.faq.length) return null;
  return (
    <section aria-labelledby="faq-title" className="flex flex-col gap-4">
      <Kicker>{cue}</Kicker>
      <h2 id="faq-title" className="text-2xl md:text-3xl">
        {t("event.faqTitle")}
      </h2>
      <div className="flex flex-col gap-2">
        {data.faq.map((f) => (
          <details
            key={f.question}
            className="group rounded-card border border-border bg-surface transition-shadow duration-(--duration-slow) ease-out open:shadow-card"
          >
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-card px-5 py-4 font-medium [&::-webkit-details-marker]:hidden">
              {f.question}
              <span
                aria-hidden
                className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border-strong transition-[transform,background-color] duration-(--duration-slow) ease-out group-open:rotate-180 group-open:bg-surface-sunken"
              >
                <ChevronDown className="size-4" />
              </span>
            </summary>
            <p className="border-t border-border px-5 py-4 leading-relaxed">{f.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export async function Sponsors({ data, cue }: Props) {
  const t = await getT();
  if (!data.sponsors.length) return null;
  return (
    <section aria-labelledby="sponsors-title" className="flex flex-col gap-4">
      <Kicker>{cue}</Kicker>
      <h2 id="sponsors-title" className="text-2xl md:text-3xl">
        {t("event.sponsorsTitle")}
      </h2>
      <ul className="flex flex-wrap gap-3">
        {data.sponsors.map((s) => (
          <li
            key={s.name}
            className="rounded-full border-[1.5px] border-border-strong px-5 py-2.5 font-mono text-sm font-medium tracking-[0.04em]"
          >
            {s.name}
          </li>
        ))}
      </ul>
    </section>
  );
}
