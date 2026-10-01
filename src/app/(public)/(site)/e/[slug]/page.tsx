import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicEvent } from "@/components/public/data";
import { EventHero } from "@/components/public/event/event-hero";
import { Faq, Speakers, Sponsors } from "@/components/public/event/event-people";
import { LiveUpdates } from "@/components/public/event/live-updates";
import { eventDays, Schedule } from "@/components/public/event/schedule";
import { istDateKey } from "@/lib/time";

export async function generateMetadata({ params }: PageProps<"/e/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const res = await getPublicEvent(slug);
  if (!res) return {};
  return { title: res.data.event.name, description: res.data.event.tagline ?? res.data.event.description };
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Public event page. No login, server rendered, and readable with JavaScript turned off. */
export default async function EventPage({ params, searchParams }: PageProps<"/e/[slug]">) {
  const { slug } = await params;
  const res = await getPublicEvent(slug);
  if (!res) notFound();
  const { data } = res;
  const query = await searchParams;

  // Default to today when the event is running (by the data's own clock), otherwise its first day.
  const days = eventDays(data.sessions);
  const today = istDateKey(data.generatedAt);
  const askedDay = one(query.day);
  const day =
    askedDay && days.includes(askedDay) ? askedDay : days.includes(today) ? today : (days[0] ?? today);
  const askedTrack = one(query.track);
  const track = askedTrack && data.tracks.some((tr) => tr.id === askedTrack) ? askedTrack : null;

  // Cue numbers follow the sections actually shown, so there are never gaps.
  const shown = [
    "updates",
    "schedule",
    ...(data.speakers.length ? ["speakers"] : []),
    ...(data.faq.length ? ["faq"] : []),
    ...(data.sponsors.length ? ["sponsors"] : []),
  ];
  const cue = (id: string) => `Cue ${String(shown.indexOf(id) + 1).padStart(2, "0")}`;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-16 px-4 pt-6 pb-8 md:gap-24 md:px-8 md:pt-8 md:pb-16">
      <EventHero data={data} isDemo={res.source === "fixture"} />
      <LiveUpdates data={data} cue={cue("updates")} />
      <Schedule data={data} day={day} track={track} cue={cue("schedule")} />
      <Speakers data={data} cue={cue("speakers")} />
      <Faq data={data} cue={cue("faq")} />
      <Sponsors data={data} cue={cue("sponsors")} />
    </div>
  );
}
