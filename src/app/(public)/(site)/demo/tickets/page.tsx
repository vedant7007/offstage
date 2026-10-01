import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { isShowcase } from "@/showcase/flag";
import tickets from "@/showcase/tickets.json";

export const metadata: Metadata = { title: "Demo tickets", robots: { index: false, follow: false } };

/**
 * Showcase only: three signed demo tickets to scan from another screen with the crew app's camera.
 * They verify offline against the showcase key, like real tickets do against the event key.
 */
export default function DemoTicketsPage() {
  if (!isShowcase()) notFound();
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-12 md:py-16">
      <PageHeader
        title="Demo tickets"
        className="pb-0"
        description="Sign in as Ravi Kumar, the volunteer, open Check-in on a phone and scan these from this screen. Each ticket checks in once; a second scan shows who let them in."
      />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tickets.tickets.map((t) => (
          <li
            key={t.ticketId}
            className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5 depth-1"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a data URL QR, nothing to optimise */}
            <img
              src={t.qrPngDataUrl}
              alt={`Ticket QR code for ${t.name}`}
              width={320}
              height={320}
              className="mx-auto aspect-square w-full max-w-64 rounded-inner bg-white"
            />
            <div className="flex flex-col gap-0.5">
              <p className="text-lg font-medium">{t.name}</p>
              <p className="text-sm text-fg-muted">{t.college}</p>
              <p className="font-mono text-xs text-fg-muted">Ticket {t.ticketId.slice(-6).toUpperCase()}</p>
            </div>
            <details className="text-sm">
              <summary className="min-h-11 cursor-pointer content-center text-fg-muted">
                Ticket code to paste
              </summary>
              <code className="block rounded-inner bg-surface-sunken p-3 font-mono text-xs break-all select-all">
                {t.token}
              </code>
            </details>
          </li>
        ))}
      </ul>
      <p className="text-sm text-fg-muted">
        No second screen?{" "}
        <Link href="/login" className="underline underline-offset-4">
          Sign in as the volunteer
        </Link>{" "}
        and paste a ticket code into the scanner&apos;s manual entry instead.
      </p>
    </div>
  );
}
