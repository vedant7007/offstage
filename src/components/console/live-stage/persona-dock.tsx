"use client";

import * as React from "react";
import {
  BatteryFull,
  Bell,
  ChevronDown,
  ClipboardCheck,
  Mail,
  MessageCircle,
  MessageSquare,
  MessageSquareDashed,
  Send,
  Signal,
  Wifi,
} from "lucide-react";
import type { PersonaFeedResponse } from "@/contracts";
import { api } from "@/lib/api-client";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { IconButton, Skeleton } from "@/components/ui";
import { BUBBLE, DOCK_CHANNEL as CHANNEL, DOCK_STATUS as STATUS, PHONE } from "./theme";

type Persona = PersonaFeedResponse["personas"][number];
type Item = Persona["items"][number];

const POLL_MS = 3000;
const BANNER_MS = 2400;

const ICON: Record<string, React.ReactNode> = {
  whatsapp: <MessageCircle aria-hidden />,
  telegram: <Send aria-hidden />,
  sms: <MessageSquare aria-hidden />,
  email: <Mail aria-hidden />,
  in_app: <Bell aria-hidden />,
  task: <ClipboardCheck aria-hidden />,
};

// A new message springs in with a short lime glow; a notification banner drops in and leaves.
// All of it sits behind no-preference, so reduced motion gets the message in place and no banner.
const MOTION = `@media (prefers-reduced-motion: no-preference) {
  .os-new { animation: os-in 420ms cubic-bezier(.34,1.56,.64,1) both, os-glow 1.2s cubic-bezier(.4,0,.1,1) both; }
  .os-banner { display: flex; animation: os-drop ${BANNER_MS}ms cubic-bezier(.4,0,.1,1) both; }
}
@keyframes os-in { from { opacity: 0; transform: translateY(14px) scale(.96); } to { opacity: 1; transform: none; } }
@keyframes os-glow { 0%, 30% { box-shadow: 0 0 0 1px rgb(193 255 0 / .55), 0 0 24px rgb(193 255 0 / .35); } 100% { box-shadow: 0 0 0 1px transparent, 0 0 0 transparent; } }
@keyframes os-drop { 0% { opacity: 0; transform: translateY(-130%); } 12%, 84% { opacity: 1; transform: none; } 100% { opacity: 0; transform: translateY(-130%); } }`;

const same = (a: string, b: string) => a.replace(/[.\s]+$/, "") === b.replace(/[.\s]+$/, "");

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

/** Delivery state as small mono ticks, always with a word. */
function Ticks({ m }: { m: Item }) {
  if (m.channel === "task") return <span>{formatTime(m.at)}</span>;
  const st = STATUS[m.status];
  return (
    <>
      <span>{formatTime(m.at)}</span>
      {st ? (
        <span className={st.className}>
          <span aria-hidden>{st.tick}</span> {st.label}
        </span>
      ) : (
        <span>{m.status}</span>
      )}
    </>
  );
}

/** One message, styled like the app it arrived in. */
function Message({ m, fresh }: { m: Item; fresh: boolean }) {
  const c = CHANNEL[m.channel] ?? CHANNEL.in_app!;
  const kind = BUBBLE[m.channel] ? m.channel : "in_app";
  const head =
    kind === "email" ? (
      <div className="mb-1.5 flex items-center gap-2">
        <span
          aria-hidden
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#1a2ffb] text-[0.625rem] font-semibold"
        >
          O
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">OFFSTAGE</span>
        <span className="font-mono text-[0.625rem] text-white/75 uppercase">{c.label}</span>
      </div>
    ) : kind === "in_app" ? (
      <div className="mb-1.5 flex items-center gap-2">
        <span aria-hidden className="flex size-5 shrink-0 items-center justify-center rounded-md bg-black">
          <span className="size-2 rounded-full bg-[#c1ff00]" />
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-[0.625rem] tracking-[0.08em] text-white/75 uppercase">
          OFFSTAGE, {c.label}
        </span>
      </div>
    ) : (
      <p className={PHONE.channel}>
        {ICON[m.channel]}
        {m.channel === "task" ? `${c.label}, ${m.status}` : c.label}
      </p>
    );
  return (
    <li className={cn(BUBBLE[kind], "text-[0.8125rem] leading-snug", fresh && "os-new")}>
      {head}
      {m.title ? <p className="font-medium">{m.title}</p> : null}
      {/* Many notices repeat the title as the body; say it once. */}
      {m.title && same(m.title, m.body) ? null : (
        <p className={cn("whitespace-pre-wrap", kind === "email" && "line-clamp-4 text-white/85")}>
          {m.body}
        </p>
      )}
      <p className={PHONE.meta}>
        <Ticks m={m} />
      </p>
    </li>
  );
}

function Phone({ p, time, fresh, banner }: { p: Persona; time: string; fresh: Set<string>; banner?: Item }) {
  const listRef = React.useRef<HTMLOListElement>(null);
  const last = p.items.at(-1)?.id;
  React.useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [last]);
  return (
    <div className={PHONE.device}>
      <span aria-hidden className={PHONE.floor} />
      <div className={PHONE.frame}>
        <div className={PHONE.bezel}>
          <section aria-label={`What ${p.name} sees`} className={PHONE.screen}>
            <span aria-hidden className={PHONE.island} />
            <div aria-hidden className={PHONE.status}>
              <span>{time}</span>
              <span className="flex items-center gap-1">
                <Signal />
                <Wifi />
                <BatteryFull className="!size-4.5" />
              </span>
            </div>
            {banner ? (
              <div aria-hidden key={banner.id} className={cn(PHONE.banner, "os-banner hidden")}>
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-black">
                  <span className="size-2.5 rounded-full bg-[#c1ff00]" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="font-mono text-[0.625rem] tracking-[0.08em] text-white/75 uppercase">
                    {(CHANNEL[banner.channel] ?? CHANNEL.in_app!).label}, now
                  </span>
                  <span className="truncate text-xs font-medium">{banner.title ?? banner.body}</span>
                </span>
              </div>
            ) : null}
            <header className={PHONE.appbar}>
              <span aria-hidden className={PHONE.avatar}>
                {initials(p.name)}
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className={PHONE.name}>{p.name}</span>
                <span className={PHONE.role}>
                  {p.role}
                  {p.phone ? <span className="tabular-nums">, {p.phone}</span> : null}
                </span>
              </span>
            </header>
            <ol ref={listRef} aria-live="polite" className={PHONE.list}>
              {p.items.length ? (
                p.items.map((m) => <Message key={m.id} m={m} fresh={fresh.has(m.id)} />)
              ) : (
                <li className="m-auto flex max-w-[12rem] flex-col items-center gap-2 text-center">
                  <span className="flex size-11 items-center justify-center rounded-full bg-white/[0.06] text-white/70 [&_svg]:size-5">
                    <MessageSquareDashed aria-hidden />
                  </span>
                  <span className="text-sm font-medium">No messages yet</span>
                  <span className="text-xs text-white/75">Approved announcements land here.</span>
                </li>
              )}
            </ol>
            <span aria-hidden className={PHONE.reflection} />
          </section>
        </div>
      </div>
    </div>
  );
}

/** A phone-shaped placeholder: the real frame, an app bar and two message bubbles. */
function PhoneSkeleton({ className }: { className?: string }) {
  const bar = "rounded-full bg-white/[0.08]";
  return (
    <div aria-hidden className={cn(PHONE.device, className)}>
      <div className={PHONE.frame}>
        <div className={PHONE.bezel}>
          <div className={PHONE.screen}>
            <span className={PHONE.island} />
            <div className="mt-11 flex items-center gap-2.5 border-b border-white/10 px-4 pb-3">
              <Skeleton className={cn("size-9", bar)} />
              <span className="flex flex-col gap-2">
                <Skeleton className={cn("h-3 w-24", bar)} />
                <Skeleton className={cn("h-2.5 w-14", bar)} />
              </span>
            </div>
            <div className="flex flex-col gap-2.5 px-3 pt-4">
              <Skeleton className="h-20 rounded-2xl bg-white/[0.06]" />
              <Skeleton className="h-16 rounded-2xl bg-white/[0.06]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * "See what they see": the attendee, a volunteer and a speaker, as their phones would show it. Refetches
 * when the console stream says a message moved (`tick`), and polls every 3 seconds while the stream is down.
 */
export function PersonaDock({
  eventId,
  tick,
  live,
  clock,
}: {
  eventId: string;
  tick: number;
  live: boolean;
  /** Demo clock in milliseconds, for the phones' status bars. */
  clock: number;
}) {
  const [personas, setPersonas] = React.useState<Persona[] | null>(null);
  const [open, setOpen] = React.useState(true);
  // Ids that arrived after the first load animate in; the first load does not.
  const known = React.useRef<Set<string> | null>(null);
  const [fresh, setFresh] = React.useState<Set<string>>(() => new Set());
  const [banners, setBanners] = React.useState<Record<string, Item>>({});
  const bannerTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = React.useCallback(
    () =>
      api.call("personaFeed", { params: { eventId } }).then(
        (r) => {
          const prev = known.current;
          const next = new Set<string>();
          const nextFresh = new Set<string>();
          const nextBanners: Record<string, Item> = {};
          for (const p of r.personas)
            for (const m of p.items) {
              next.add(m.id);
              if (prev && !prev.has(m.id)) {
                nextFresh.add(m.id);
                nextBanners[p.key] = m;
              }
            }
          known.current = next;
          setPersonas(r.personas);
          if (nextFresh.size) {
            setFresh(nextFresh);
            setBanners(nextBanners);
            clearTimeout(bannerTimer.current);
            bannerTimer.current = setTimeout(() => setBanners({}), BANNER_MS);
          }
        },
        () => undefined,
      ),
    [eventId],
  );
  React.useEffect(() => () => clearTimeout(bannerTimer.current), []);
  // A burst of stream messages becomes one fetch.
  React.useEffect(() => {
    const id = setTimeout(() => void load(), tick ? 400 : 0);
    return () => clearTimeout(id);
  }, [load, tick]);
  React.useEffect(() => {
    if (live) return;
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
  }, [load, live]);

  if (personas && !personas.length) return null; // not in demo mode
  const time = formatTime(clock).replace(/ [AP]M$/, "");
  return (
    <section aria-labelledby="phones-title" className={PHONE.band}>
      <style>{MOTION}</style>
      <span aria-hidden className={PHONE.bandSpot} />
      <span aria-hidden className={PHONE.bandFloor} />
      <div className={PHONE.head}>
        <div className="flex flex-col gap-1">
          <span className="kicker inline-flex items-center gap-2 text-curtain-text after:h-px after:w-8 after:bg-current">
            Phones
          </span>
          <h2 id="phones-title" className="text-lg font-medium tracking-[-0.02em]">
            See what they see
          </h2>
          <p className="text-sm text-fg-muted">
            The attendee, a volunteer and a speaker. Every message lands here as it is sent.
          </p>
        </div>
        <IconButton
          label={open ? "Hide the phones" : "Show the phones"}
          aria-expanded={open}
          aria-controls="phones-grid"
          onClick={() => setOpen((o) => !o)}
          className="shrink-0 rounded-full text-fg-muted hover:text-fg"
          icon={
            <ChevronDown
              aria-hidden
              className={cn(
                "size-5 transition-transform duration-300 ease-[cubic-bezier(.4,0,.1,1)]",
                open && "rotate-180",
              )}
            />
          }
        />
      </div>
      <div id="phones-grid" hidden={!open} aria-busy={!personas} className={PHONE.grid}>
        {personas
          ? personas.map((p) => <Phone key={p.key} p={p} time={time} fresh={fresh} banner={banners[p.key]} />)
          : [0, 1, 2].map((i) => (
              <PhoneSkeleton key={i} className={["", "hidden sm:block", "hidden lg:block"][i]} />
            ))}
      </div>
    </section>
  );
}
