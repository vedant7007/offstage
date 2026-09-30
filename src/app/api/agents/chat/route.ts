import { ChatRequest, ChatStreamChunk } from "@/contracts/api";
import { logger } from "@/lib/logger";
import { getActor, requirePermission } from "@/server/authz";
import { HttpError, readJson, route } from "@/server/http";
import { enforce } from "@/server/rate-limit";
import { askHelpdesk, type AskerRole } from "@/server/services/helpdesk-chat";

export const dynamic = "force-dynamic";

const log = logger.child({ module: "api.chat" });

const ASKER: Partial<Record<string, AskerRole>> = { volunteer: "volunteer", speaker: "speaker" };

// Helpdesk chat for the signed-in person, as newline-delimited ChatStreamChunk JSON.
export const POST = route(async (req) => {
  const actor = await getActor(req);
  requirePermission(actor, "helpdesk.chat", { eventId: actor.eventId });
  const body = await readJson(req, ChatRequest);
  await enforce(`chat:user:${actor.userId}`, 20, 600, "Too many questions. Wait a few minutes.");

  const enc = new TextEncoder();
  const line = (c: ChatStreamChunk) => enc.encode(`${JSON.stringify(ChatStreamChunk.parse(c))}\n`);
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const result = await askHelpdesk({
          eventId: actor.eventId,
          text: body.message,
          channel: "in_app",
          askerRole: ASKER[actor.role] ?? "attendee",
          actor,
          userId: actor.userId,
          conversationId: body.conversationId,
        });
        // The answer is checked as a whole before it may be shown, so it streams by sentence after that.
        for (const part of result.answer.answer.match(/[^.!?।]+[.!?।]*\s*/g) ?? [result.answer.answer])
          controller.enqueue(line({ type: "delta", text: part }));
        controller.enqueue(line({ type: "done", result }));
      } catch (err) {
        const code = err instanceof HttpError ? err.code : "internal";
        if (!(err instanceof HttpError)) log.error({ err }, "chat failed");
        const message = err instanceof HttpError ? err.message : "Something went wrong";
        controller.enqueue(line({ type: "error", code, message }));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
});
