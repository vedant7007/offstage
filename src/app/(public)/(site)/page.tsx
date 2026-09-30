import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui";
import { HeroArt } from "@/components/public/hero-art";
import { CONSOLE_PATH, DEMO_EVENT_SLUG, eventPath } from "@/components/public/links";
import { getT } from "@/lib/i18n/server";

const LAW = ["propose", "decide", "approve", "execute"] as const;

export default async function LandingPage() {
  const t = await getT();
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-16 px-4 pt-10 md:px-8 md:pt-16">
      <section aria-labelledby="hero-title" className="grid items-center gap-10 md:grid-cols-[1.15fr_1fr]">
        <div className="flex flex-col gap-6">
          <p className="text-sm font-semibold tracking-wide text-curtain-text uppercase">
            {t("landing.eyebrow")}
          </p>
          <div className="flex flex-col gap-3">
            <h1 id="hero-title" className="font-display text-3xl leading-tight font-bold md:text-4xl">
              {t("landing.title")}
            </h1>
            <p className="text-xl text-fg-muted">{t("landing.subtitle")}</p>
          </div>
          <ul className="flex flex-col gap-3 text-base">
            {(["line1", "line2", "line3"] as const).map((line, i) => (
              <li key={line} className="flex gap-3">
                <span
                  aria-hidden
                  className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-agent-soft text-xs font-semibold text-agent-soft-fg"
                >
                  {i + 1}
                </span>
                {t(`landing.${line}`)}
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href={eventPath(DEMO_EVENT_SLUG)}>
                {t("landing.demoCta")}
                <ArrowRight aria-hidden />
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link href={CONSOLE_PATH}>{t("landing.startCta")}</Link>
            </Button>
          </div>
          <p className="text-sm text-fg-muted">{t("landing.demoNote")}</p>
        </div>
        <HeroArt className="mx-auto max-w-md" />
      </section>

      <section aria-labelledby="law-title" className="flex flex-col gap-6">
        <h2 id="law-title" className="font-display text-2xl font-bold">
          {t("landing.lawTitle")}
        </h2>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {LAW.map((step, i) => (
            <li key={step} className="flex flex-col gap-2 rounded-card border border-border bg-surface p-5">
              <span className="font-mono text-sm text-fg-muted" aria-hidden>
                0{i + 1}
              </span>
              <p className="text-lg font-semibold">{t(`landing.law.${step}`)}</p>
              <p className="text-sm text-fg-muted">{t(`landing.lawDetail.${step}`)}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
