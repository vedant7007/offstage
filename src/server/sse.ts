/**
 * Server-sent events for route handlers. `sseResponse` opens the stream, sends a heartbeat every
 * 25 seconds (proxies drop idle connections), and cleans up when the browser goes away.
 * Browsers reconnect on their own; pages fall back to polling when the stream fails.
 */
import { logger } from "@/lib/logger";
import { nowUtc } from "@/lib/time";

const log = logger.child({ module: "sse" });
const HEARTBEAT_MS = 25_000;

export interface SseChannel {
  /** Send one message as `event: <name>` with JSON data. False once the stream is closed. */
  send(name: string, data: unknown): boolean;
}

export function sseResponse(
  req: Request,
  start: (ch: SseChannel) => Promise<(() => void) | void> | (() => void) | void,
  heartbeat: () => unknown = () => ({ type: "heartbeat", at: nowUtc().toISOString() }),
): Response {
  const enc = new TextEncoder();
  let closed = false;
  let cleanup: (() => void) | void;
  let timer: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const ch: SseChannel = {
        send(name, data) {
          if (closed) return false;
          try {
            controller.enqueue(enc.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`));
            return true;
          } catch {
            close();
            return false;
          }
        },
      };
      const close = () => {
        if (closed) return;
        closed = true;
        if (timer) clearInterval(timer);
        try {
          cleanup?.();
        } catch (err) {
          log.warn({ err }, "sse cleanup failed");
        }
        try {
          controller.close();
        } catch {
          // already closed by the client
        }
      };
      req.signal.addEventListener("abort", close);
      // Reconnect after 5 s if the connection drops.
      controller.enqueue(enc.encode("retry: 5000\n\n"));
      timer = setInterval(() => ch.send("heartbeat", heartbeat()), HEARTBEAT_MS);
      try {
        cleanup = await start(ch);
      } catch (err) {
        log.error({ err }, "sse start failed");
        close();
      }
    },
    cancel() {
      closed = true;
      if (timer) clearInterval(timer);
      cleanup?.();
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
      // Caddy and nginx: do not buffer the stream.
      "x-accel-buffering": "no",
    },
  });
}
