import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { getPublicEvent } from "@/components/public/data";
import { SpeakerForm } from "@/components/public/forms/speaker-form";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata({
  params,
}: PageProps<"/e/[slug]/speaker/[token]">): Promise<Metadata> {
  const { slug } = await params;
  const [res, t] = await Promise.all([getPublicEvent(slug), getT()]);
  // Token links are private; never index them.
  return {
    title: res ? t("speakerForm.title", { event: res.data.event.name }) : undefined,
    robots: { index: false, follow: false },
  };
}

export default async function SpeakerFormPage({ params }: PageProps<"/e/[slug]/speaker/[token]">) {
  const { slug, token } = await params;
  const [res, t] = await Promise.all([getPublicEvent(slug), getT()]);
  if (!res) notFound();
  return (
    <div className="mx-auto flex max-w-2xl flex-col px-4 pt-8 md:px-8">
      <PageHeader
        title={t("speakerForm.title", { event: res.data.event.name })}
        description={t("speakerForm.intro")}
      />
      <SpeakerForm slug={slug} token={token} />
    </div>
  );
}
