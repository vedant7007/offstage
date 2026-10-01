import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui";
import { getPublicEvent } from "@/components/public/data";
import { RegisterFlow, type ChoosableSession } from "@/components/public/register/register-flow";
import { getT } from "@/lib/i18n/server";

// Sessions people book a seat in. Breaks, meals, ceremonies and judging are open to everyone.
const BOOKABLE = new Set(["keynote", "talk", "workshop", "panel"]);

export async function generateMetadata({ params }: PageProps<"/e/[slug]/register">): Promise<Metadata> {
  const { slug } = await params;
  const [res, t] = await Promise.all([getPublicEvent(slug), getT()]);
  return res ? { title: t("register.title", { event: res.data.event.name }), robots: { index: false } } : {};
}

export default async function RegisterPage({ params }: PageProps<"/e/[slug]/register">) {
  const { slug } = await params;
  const [res, t] = await Promise.all([getPublicEvent(slug), getT()]);
  if (!res) notFound();
  const { event, rooms, sessions, capacity } = res.data;
  const roomName = new Map(rooms.map((r) => [r.id, r.name]));
  const closed =
    event.status === "closed" || (capacity.registered >= capacity.total && !capacity.waitlistOpen);

  const choosable: ChoosableSession[] = sessions
    .filter((s) => BOOKABLE.has(s.kind) && (s.status === "scheduled" || s.status === "delayed"))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map((s) => ({
      id: s.id,
      title: s.title,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      roomName: roomName.get(s.roomId),
      capacity: s.capacity,
      registeredCount: s.registeredCount,
    }));

  return (
    <div className="mx-auto flex max-w-2xl flex-col px-4 pt-8 md:px-8 md:pt-12">
      <PageHeader
        back={
          <Link
            href={`/e/${slug}`}
            className="inline-flex min-h-11 w-fit items-center gap-2 rounded-full border-[1.5px] border-border-strong px-4 text-sm font-medium transition-colors duration-(--duration-fast) ease-out hover:bg-surface"
          >
            <ArrowLeft aria-hidden className="size-4" />
            {event.name}
          </Link>
        }
        title={t("register.title", { event: event.name })}
        description={t("register.intro")}
      />
      {closed ? (
        <EmptyState title={t("event.registrationClosed")} />
      ) : (
        <RegisterFlow
          event={{
            slug,
            name: event.name,
            startsAt: event.startsAt,
            endsAt: event.endsAt,
            venue: [event.venue.name, event.venue.address, event.venue.city].join(", "),
          }}
          sessions={choosable}
          turnstileSiteKey={process.env.TURNSTILE_SITE_KEY || null}
        />
      )}
    </div>
  );
}
