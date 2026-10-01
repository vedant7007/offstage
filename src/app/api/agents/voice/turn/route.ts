import { VoiceEvent, VoiceTurnRequest } from "@/contracts/api";
import { spentToday } from "@/ai/router";
import { logger } from "@/lib/logger";
import { getActor } from "@/server/authz";
import { assertSameOrigin, readJson, route } from "@/server/http";
import { enforce } from "@/server/rate-limit";
import { voiceTurn } from "@/server/services/voice-turn";

export const dynamic = "force-dynamic";
const log = logger.child({ module: "api.voice" });

// One voice or typed turn with the Commander, as newline-delimited VoiceEvent JSON.
export const POST = route(async (req) => {
  assertSameOrigin(req);
  const actor = await getActor(req);
  const body = await readJson(req, VoiceTurnRequest);
  await enforce(`voice-turn:${actor.userId}`, 30, 60, "Too many voice commands. Wait a minute.");
  const enc = new TextEncoder();
  const line = (e: VoiceEvent) => enc.encode(`${JSON.stringify(VoiceEvent.parse(e))}\n`);
  const t0 = performance.now();
  // ponytail: spend delta over the turn, so a turn that overlaps another counts a little of both.
  const spentBefore = spentToday().usd;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const e of voiceTurn(actor, body)) controller.enqueue(line(e));
      } catch (err) {
        log.warn({ err }, "voice turn stream failed");
        controller.enqueue(line({ type: "error", message: "The turn failed" }));
      } finally {
        controller.enqueue(
          line({
            type: "done",
            costUsd: Math.max(0, spentToday().usd - spentBefore),
            ms: Math.round(performance.now() - t0),
          }),
        );
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
});
