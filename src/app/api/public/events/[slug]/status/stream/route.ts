import { PublicStatusStreamMessage } from "@/contracts/api";
import { logger } from "@/lib/logger";
import { errorResponse } from "@/server/http";
import { subscribe } from "@/server/events/bus";
import { eventBySlug, getPublicStatus, invalidatePublic } from "@/server/services/public";
import { nowUtc } from "@/lib/time";
import { sseResponse } from "@/server/sse";

export const dynamic = "force-dynamic";

const log = logger.child({ module: "api.status-stream" });
/** Now and next move with the clock even when nothing is published. */
const TICK_MS = 60_000;
/** Several changes in one approval (a plan bundle) become one push. */
const DEBOUNCE_MS = 1_000;

type Ctx = { params: Promise<{ slug: string }> };

const affectsBoard = (type: string) => type.startsWith("session.") || type === "announcement.sent";

/**
 * Venue status board stream (issue #33): `event: status` with the full PublicStatusResponse on
 * connect, whenever a session changes or a public announcement goes out, and every minute;
 * `event: heartbeat` every 25 seconds. No login. The page polls when the stream fails.
 */
export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  let slug: string;
  let eventId: string;
  try {
    slug = (await ctx.params).slug;
    eventId = (await eventBySlug(slug)).id;
  } catch (err) {
    return errorResponse(err);
  }

  return sseResponse(
    req,
    async (ch) => {
      const push = () =>
        getPublicStatus(slug)
          .then((status) => ch.send("status", PublicStatusStreamMessage.parse({ type: "status", status })))
          .catch((err: unknown) => log.warn({ err }, "status push failed"));
      let pending: ReturnType<typeof setTimeout> | undefined;
      const off = subscribe(eventId, (n) => {
        if (!affectsBoard(n.type) || pending) return;
        pending = setTimeout(() => {
          pending = undefined;
          invalidatePublic(eventId);
          void push();
        }, DEBOUNCE_MS);
      });
      await push();
      const timer = setInterval(() => void push(), TICK_MS);
      return () => {
        clearInterval(timer);
        if (pending) clearTimeout(pending);
        off();
      };
    },
    () => PublicStatusStreamMessage.parse({ type: "heartbeat", at: nowUtc().toISOString() }),
  );
}
