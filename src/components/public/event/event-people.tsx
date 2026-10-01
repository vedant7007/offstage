import { ChevronDown } from "lucide-react";
import type { PublicEventResponse } from "@/contracts";
import { Avatar } from "@/components/ui";
import { getT } from "@/lib/i18n/server";
import { Reveal } from "@/components/ui/motion";
import { SectionHead } from "@/components/public/event/section-head";

type Props = { data: PublicEventResponse; cue: string };

export async function Speakers({ data, cue }: Props) {
  const t = await getT();
  if (!data.speakers.length) return null;
  const sessions = new Map(data.sessions.map((s) => [s.id, s.title]));
  return (
    <section aria-labelledby="speakers-title" className="flex flex-col gap-8">
      <SectionHead cue={cue} id="speakers-title">
        {t("event.speakersTitle")}
      </SectionHead>
      <ul className="grid gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-3">
        {data.speakers.map((sp, i) => (
          <Reveal
            as="li"
            key={sp.id}
            index={i % 3}
            className="flex gap-4 rounded-card border border-border bg-surface p-5 depth-2 md:p-6"
          >
            <Avatar name={sp.name} decorative />
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-lg font-medium">{sp.name}</p>
              {sp.title || sp.organization ? (
                <p className="text-sm text-fg-muted">
                  {[sp.title, sp.organization].filter(Boolean).join(", ")}
                </p>
              ) : null}
              {sp.sessionIds.length ? (
                <ul className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3 text-sm">
                  {sp.sessionIds.map((id) =>
                    sessions.get(id) ? <li key={id}>{sessions.get(id)}</li> : null,
                  )}
                </ul>
              ) : null}
            </div>
          </Reveal>
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
    <section aria-labelledby="faq-title" className="flex flex-col gap-8">
      <SectionHead cue={cue} id="faq-title">
        {t("event.faqTitle")}
      </SectionHead>
      <div className="flex flex-col gap-3">
        {data.faq.map((f) => (
          <details
            key={f.question}
            className="group rounded-card border border-border bg-surface depth-1 transition-colors duration-(--duration-slow) ease-out open:border-border-strong"
          >
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 rounded-card px-5 py-4 text-lg font-medium md:px-6 [&::-webkit-details-marker]:hidden">
              {f.question}
              <span
                aria-hidden
                className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border-strong transition-[rotate,background-color] duration-(--duration-slow) ease-(--ease-in-out) group-open:rotate-180 group-open:bg-surface-sunken"
              >
                <ChevronDown className="size-4" />
              </span>
            </summary>
            <p className="measure border-t border-border px-5 py-4 text-pretty text-fg-muted md:px-6">
              {f.answer}
            </p>
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
    <section aria-labelledby="sponsors-title" className="flex flex-col gap-8">
      <SectionHead cue={cue} id="sponsors-title">
        {t("event.sponsorsTitle")}
      </SectionHead>
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
