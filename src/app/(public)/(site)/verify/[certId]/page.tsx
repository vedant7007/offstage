import type { Metadata } from "next";
import { BadgeCheck, CircleHelp, OctagonX } from "lucide-react";
import { KeyValueList, PageHeader } from "@/components/ui";
import { getCertificate } from "@/components/public/data";
import { getT } from "@/lib/i18n/server";
import { formatDate, formatDayShort } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Reveal, TextReveal } from "@/components/ui/motion";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  // Certificates carry a person's name, so keep them out of search engines.
  return { title: t("verify.title"), robots: { index: false, follow: false } };
}

/**
 * Public certificate check. Valid, revoked and unknown look clearly different (colour, icon,
 * heading and border style), and only what the certificate itself shows is displayed.
 */
export default async function VerifyPage({ params }: PageProps<"/verify/[certId]">) {
  const { certId } = await params;
  const [{ data }, t] = await Promise.all([getCertificate(certId), getT()]);
  const cert = data.certificate;
  const state = !cert ? "missing" : cert.revoked ? "revoked" : "valid";

  const look = {
    valid: {
      icon: BadgeCheck,
      title: t("verify.valid"),
      body: t("verify.validBody"),
      box: "border-approved bg-approved-soft text-approved-soft-fg",
    },
    revoked: {
      icon: OctagonX,
      title: t("verify.revoked"),
      body: t("verify.revokedBody", { date: cert?.revokedAt ? formatDate(cert.revokedAt) : "" }),
      box: "border-danger bg-danger-soft text-danger-soft-fg border-dashed",
    },
    missing: {
      icon: CircleHelp,
      title: t("verify.notFound"),
      body: t("verify.notFoundBody"),
      box: "border-border-strong bg-surface text-fg",
    },
  }[state];
  const Icon = look.icon;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pt-10 md:px-8 md:pt-14">
      <PageHeader
        eyebrow="OFFSTAGE"
        title={<TextReveal as="span" text={t("verify.title")} />}
        description={t("verify.intro")}
        className="pb-0"
      />

      {/* The verdict settles in once, just after the heading. */}
      <Reveal
        as="section"
        variant="scale"
        delay={150}
        aria-labelledby="verify-result"
        data-state={state}
        className={cn("flex flex-col gap-6 rounded-card border-2 p-5 depth-2 md:p-8", look.box)}
      >
        <div className="flex items-start gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full border-2 border-current">
            <Icon aria-hidden className="size-6" />
          </span>
          <div className="flex flex-col gap-1">
            <h2 id="verify-result" className="text-2xl md:text-3xl">
              {look.title}
            </h2>
            <p>{look.body}</p>
          </div>
        </div>

        {cert ? (
          <div className="rounded-inner bg-surface-raised p-5 text-fg depth-1 md:p-6">
            <p className="kicker text-fg-muted">{t("verify.recipient")}</p>
            <p
              className={cn(
                "mt-1 text-3xl font-medium tracking-[-0.03em] md:text-4xl",
                cert.revoked && "line-through",
              )}
            >
              {cert.recipientName}
            </p>
            <KeyValueList
              className="mt-4"
              items={[
                { key: "title", label: t("verify.certificate"), value: cert.title },
                { key: "kind", label: t("verify.kind"), value: t(`verify.kinds.${cert.kind}`) },
                { key: "event", label: t("verify.event"), value: cert.eventName },
                {
                  key: "dates",
                  label: t("verify.eventDates"),
                  value: t("event.dates", {
                    start: formatDayShort(cert.eventDates.startsAt),
                    end: formatDate(cert.eventDates.endsAt),
                  }),
                },
                ...(cert.hours !== undefined
                  ? [{ key: "hours", label: t("verify.hours"), value: String(cert.hours) }]
                  : []),
                { key: "by", label: t("verify.issuedBy"), value: cert.issuedBy },
                { key: "on", label: t("verify.issuedOn"), value: formatDate(cert.issuedAt) },
                {
                  key: "id",
                  label: t("verify.id"),
                  value: <span className="font-mono text-sm break-all">{cert.id}</span>,
                },
              ]}
            />
          </div>
        ) : (
          <p className="font-mono text-sm break-all">
            {t("verify.id")}: {certId}
          </p>
        )}
      </Reveal>
    </div>
  );
}
