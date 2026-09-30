import { ChevronDown } from "lucide-react";
import type { PublicEventResponse } from "@/contracts";
import { Avatar } from "@/components/ui";
import { getT } from "@/lib/i18n/server";

type Props = { data: PublicEventResponse };

export async function Speakers({ data }: Props) {
  const t = await getT();
  if (!data.speakers.length) return null;
  const sessions = new Map(data.sessions.map((s) => [s.id, s.title]));
  return (
    <section aria-labelledby="speakers-title" className="flex flex-col gap-4">
      <h2 id="speakers-title" className="text-2xl font-semibold">
        {t("event.speakersTitle")}
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.speakers.map((sp) => (
          <li key={sp.id} className="flex gap-3 rounded-card border border-border bg-surface p-4">
            <Avatar name={sp.name} decorative />
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="font-semibold">{sp.name}</p>
              {sp.title || sp.organization ? (
                <p className="text-sm text-fg-muted">
                  {[sp.title, sp.organization].filter(Boolean).join(", ")}
                </p>
              ) : null}
              {sp.sessionIds.length ? (
                <ul className="mt-1 text-sm">
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
export async function Faq({ data }: Props) {
  const t = await getT();
  if (!data.faq.length) return null;
  return (
    <section aria-labelledby="faq-title" className="flex flex-col gap-4">
      <h2 id="faq-title" className="text-2xl font-semibold">
        {t("event.faqTitle")}
      </h2>
      <div className="flex flex-col gap-2">
        {data.faq.map((f) => (
          <details key={f.question} className="group rounded-card border border-border bg-surface">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-medium [&::-webkit-details-marker]:hidden">
              {f.question}
              <ChevronDown
                aria-hidden
                className="size-4 shrink-0 transition-transform group-open:rotate-180"
              />
            </summary>
            <p className="border-t border-border px-4 py-3 leading-relaxed">{f.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export async function Sponsors({ data }: Props) {
  const t = await getT();
  if (!data.sponsors.length) return null;
  return (
    <section aria-labelledby="sponsors-title" className="flex flex-col gap-3">
      <h2 id="sponsors-title" className="text-xl font-semibold">
        {t("event.sponsorsTitle")}
      </h2>
      <ul className="flex flex-wrap gap-3">
        {data.sponsors.map((s) => (
          <li key={s.name} className="rounded-card border border-border bg-surface px-5 py-3 font-semibold">
            {s.name}
          </li>
        ))}
      </ul>
    </section>
  );
}
