import { DemoInboxQuery } from "@/contracts/api";
import { logger } from "@/lib/logger";
import { formatDateTime } from "@/lib/time";
import { demoInboxAllowed, latestDemoMessage } from "@/server/channels/demo-inbox";
import { clientIp, errorResponse, notFound } from "@/server/http";
import { enforce } from "@/server/rate-limit";
import { eventBySlug } from "@/server/services/public";

export const dynamic = "force-dynamic";

const log = logger.child({ module: "api.demo-inbox" });

type Ctx = { params: Promise<{ slug: string }> };

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(title)}</title>
<style>body{font-family:system-ui,sans-serif;line-height:1.5;max-width:40rem;margin:2rem auto;padding:0 1rem;color:#1a1a1a;background:#faf6ef}
@media (prefers-color-scheme:dark){body{color:#f2f2f2;background:#111318}}
.note{font-size:.9rem;opacity:.8}pre{white-space:pre-wrap;font:inherit;padding:1rem;border:1px solid #8886;border-radius:.5rem}</style>
</head><body>${body}</body></html>`;
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
    },
  });
}

// DEMO_MODE only: the latest OTP email sent to an eligible address, from the server's Mailpit.
export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  try {
    const { slug } = await ctx.params;
    const parsed = DemoInboxQuery.safeParse({ email: new URL(req.url).searchParams.get("email") ?? "" });
    if (!parsed.success || !demoInboxAllowed(parsed.data.email)) throw notFound();
    await eventBySlug(slug);
    await enforce(`demo-inbox:${clientIp(req)}`, 60, 600, "Too many requests. Try again in a few minutes.");
    const msg = await latestDemoMessage(parsed.data.email);
    const note = `<p class="note">Demo inbox. This page exists only in demo mode, for seeded demo people and the team's allowlisted addresses.</p>`;
    if (!msg)
      return page(
        "Demo inbox",
        `<h1>Demo inbox</h1><p>No code has been sent to this address yet. Ask for a code first.</p>${note}`,
      );
    return page(
      msg.subject,
      `<h1>${esc(msg.subject)}</h1><p class="note">Received ${esc(formatDateTime(msg.receivedAt))} IST</p><pre>${esc(msg.text)}</pre>${note}`,
    );
  } catch (err) {
    if (!(err instanceof Error) || err.name !== "HttpError")
      log.warn({ err: String(err) }, "demo inbox failed");
    return errorResponse(err);
  }
}
