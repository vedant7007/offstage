import type { Metadata } from "next";
import {
  HeartPulse,
  Lock,
  MessageCircleQuestionMark,
  PenLine,
  Scale,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { DraftedByLabel, PageHeader, TierBadge } from "@/components/ui";
import { getT } from "@/lib/i18n/server";
import type { MessageKey } from "@/lib/i18n/translate";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("aboutAi.title"), description: t("aboutAi.intro") };
}

type Block = { id: string; icon: React.ReactNode; title: MessageKey; body: MessageKey };

const BLOCKS: Block[] = [
  { id: "decide", icon: <UserCheck aria-hidden />, title: "aboutAi.decideTitle", body: "aboutAi.decideBody" },
  {
    id: "honest",
    icon: <MessageCircleQuestionMark aria-hidden />,
    title: "aboutAi.honestTitle",
    body: "aboutAi.honestBody",
  },
  {
    id: "emergency",
    icon: <HeartPulse aria-hidden />,
    title: "aboutAi.emergencyTitle",
    body: "aboutAi.emergencyBody",
  },
  { id: "data", icon: <Lock aria-hidden />, title: "aboutAi.dataTitle", body: "aboutAi.dataBody" },
  {
    id: "rights",
    icon: <ShieldCheck aria-hidden />,
    title: "aboutAi.rightsTitle",
    body: "aboutAi.rightsBody",
  },
  { id: "limits", icon: <Scale aria-hidden />, title: "aboutAi.limitsTitle", body: "aboutAi.limitsBody" },
];

const LAW = ["propose", "decide", "approve", "execute"] as const;

/** The ethics page from blueprint Section 7, in plain language. */
export default async function AboutAiPage() {
  const t = await getT();
  const block = (b: Block, num: number, extra?: React.ReactNode, wide = false) => (
    <section
      key={b.id}
      aria-labelledby={`${b.id}-title`}
      className={cn(
        "flex flex-col gap-4 rounded-card border border-border bg-surface p-6 shadow-card md:p-7",
        wide && "md:col-span-2",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-agent-soft text-agent-soft-fg [&_svg]:size-5">
          {b.icon}
        </span>
        <span aria-hidden className="kicker text-fg-muted">
          {String(num).padStart(2, "0")}
        </span>
      </div>
      <h2 id={`${b.id}-title`} className="text-xl md:text-2xl">
        {t(b.title)}
      </h2>
      <p className="text-base leading-relaxed text-fg-muted">{t(b.body)}</p>
      {extra}
    </section>
  );

  const [decide, ...rest] = BLOCKS;
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-10 px-4 pt-10 md:px-8 md:pt-14">
      <PageHeader
        display
        eyebrow="OFFSTAGE"
        title={t("aboutAi.title")}
        description={t("aboutAi.intro")}
        className="pb-0"
      />

      <ol
        aria-label={t("landing.lawTitle")}
        className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border md:grid-cols-4"
      >
        {LAW.map((k, i) => (
          <li key={k} className="flex flex-col gap-2 bg-surface p-4 md:p-5">
            <span aria-hidden className="kicker text-curtain-text">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="font-medium tracking-[-0.015em]">{t(`landing.law.${k}`)}</span>
          </li>
        ))}
      </ol>

      <div className="grid gap-4 md:grid-cols-2">
        {decide
          ? block(
              decide,
              1,
              <div className="mt-1 flex flex-col gap-3 rounded-card border border-border bg-bg p-4">
                <p className="kicker text-fg-muted">{t("aboutAi.tiersTitle")}</p>
                <ul className="grid gap-2 lg:grid-cols-2">
                  {(["T0", "T1", "T2", "T3"] as const).map((tier) => (
                    <li key={tier}>
                      <TierBadge tier={tier} showMeaning />
                    </li>
                  ))}
                </ul>
              </div>,
              true,
            )
          : null}

        {block(
          {
            id: "labelled",
            icon: <PenLine aria-hidden />,
            title: "aboutAi.labelledTitle",
            body: "aboutAi.labelledBody",
          },
          2,
          <div className="rounded-card border border-border bg-bg p-4">
            <DraftedByLabel approvedBy="lead" className="text-sm" />
          </div>,
          true,
        )}

        {rest.map((b, i) => block(b, i + 3))}
      </div>
    </div>
  );
}
