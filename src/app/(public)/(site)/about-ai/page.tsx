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

/** The ethics page from blueprint Section 7, in plain language. */
export default async function AboutAiPage() {
  const t = await getT();
  const block = (b: Block, extra?: React.ReactNode) => (
    <section key={b.id} aria-labelledby={`${b.id}-title`} className="flex gap-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-agent-soft text-agent-soft-fg [&_svg]:size-5">
        {b.icon}
      </span>
      <div className="flex flex-col gap-2">
        <h2 id={`${b.id}-title`} className="text-xl font-semibold">
          {t(b.title)}
        </h2>
        <p className="text-base leading-relaxed">{t(b.body)}</p>
        {extra}
      </div>
    </section>
  );

  const [decide, ...rest] = BLOCKS;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10 px-4 pt-10 md:px-8">
      <PageHeader display title={t("aboutAi.title")} description={t("aboutAi.intro")} className="pb-0" />

      {decide
        ? block(
            decide,
            <div className="mt-2 flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
              <p className="text-sm font-semibold">{t("aboutAi.tiersTitle")}</p>
              <ul className="flex flex-col gap-2">
                {(["T0", "T1", "T2", "T3"] as const).map((tier) => (
                  <li key={tier}>
                    <TierBadge tier={tier} showMeaning />
                  </li>
                ))}
              </ul>
            </div>,
          )
        : null}

      {block(
        {
          id: "labelled",
          icon: <PenLine aria-hidden />,
          title: "aboutAi.labelledTitle",
          body: "aboutAi.labelledBody",
        },
        <div className="rounded-card border border-border bg-surface p-4">
          <DraftedByLabel approvedBy="lead" className="text-sm" />
        </div>,
      )}

      {rest.map((b) => block(b))}
    </div>
  );
}
