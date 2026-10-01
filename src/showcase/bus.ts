/**
 * The showcase stand-in for the console SSE stream. The timeline engine emits recorded StreamMessages
 * here and `ShowcaseStream` hands them to listeners exactly as an EventSource would: one event per
 * message type, with the JSON as `data`. Tiny and dependency free, so the api client can import it.
 */
import type { StreamMessage } from "@/contracts/api";

const handlers = new Set<(m: StreamMessage) => void>();

export function emit(m: StreamMessage) {
  handlers.forEach((h) => h(m));
}

export function onMessage(h: (m: StreamMessage) => void): () => void {
  handlers.add(h);
  return () => handlers.delete(h);
}

/** The slice of EventSource that the console uses. */
export interface StreamLike {
  addEventListener(type: string, fn: (e: Event) => void): void;
  close(): void;
  onopen: ((e: Event) => unknown) | null;
  onerror: ((e: Event) => unknown) | null;
}

export class ShowcaseStream extends EventTarget implements StreamLike {
  onopen: ((e: Event) => unknown) | null = null;
  onerror: ((e: Event) => unknown) | null = null;
  private off: () => void;
  private timer: ReturnType<typeof setTimeout>;

  constructor() {
    super();
    this.off = onMessage((m) => this.dispatchEvent(new MessageEvent(m.type, { data: JSON.stringify(m) })));
    // Opens on the next tick, like a real connection, so handlers set after construction still fire.
    this.timer = setTimeout(() => this.onopen?.(new Event("open")), 0);
  }

  close() {
    clearTimeout(this.timer);
    this.off();
  }
}
