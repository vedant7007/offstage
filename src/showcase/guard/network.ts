/**
 * Showcase network guard. The hosted showcase must never call a third-party host, so in the
 * browser every request API is wrapped: same-origin and the static font hosts pass, anything
 * else throws in development and is blocked with one console warning in production.
 */

export const ALLOWED_FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"] as const;

/** URL policy: same host (http, https, ws, wss), data: and blob: URLs, and the font hosts over https. */
export function isAllowedUrl(input: string | URL, base: string): boolean {
  let url: URL;
  let origin: URL;
  try {
    origin = new URL(base);
    url = new URL(String(input), origin);
  } catch {
    return false;
  }
  if (url.protocol === "data:" || url.protocol === "blob:") return true;
  if (["http:", "https:", "ws:", "wss:"].includes(url.protocol) && url.host === origin.host) return true;
  return url.protocol === "https:" && (ALLOWED_FONT_HOSTS as readonly string[]).includes(url.hostname);
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

const INSTALLED = Symbol.for("offstage.showcase.networkGuard");

/**
 * Wraps fetch, EventSource, WebSocket, navigator.sendBeacon and XMLHttpRequest.open on `win`.
 * Idempotent. `dev` decides between throwing (dev) and warn-once-and-block (production).
 */
export function installNetworkGuard(win: Window & typeof globalThis, dev: boolean): void {
  const flagged = win as unknown as Record<symbol, boolean>;
  if (flagged[INSTALLED]) return;
  flagged[INSTALLED] = true;

  let warned = false;
  const allowed = (target: string | URL) => isAllowedUrl(target, win.location.href);
  /** Throws in dev; in production warns once and returns the error for the caller to surface. */
  const block = (api: string, target: string | URL): Error => {
    const err = new Error(`Showcase network guard blocked ${api} to ${String(target)}`);
    if (dev) throw err;
    if (!warned) {
      warned = true;
      console.warn(`${err.message}. The showcase makes no third-party calls; further blocks are silent.`);
    }
    return err;
  };

  const nativeFetch = win.fetch.bind(win);
  win.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const target = requestUrl(input);
    return allowed(target) ? nativeFetch(input, init) : Promise.reject(block("fetch", target));
  };

  const wrapCtor = <C extends abstract new (...args: never[]) => unknown>(Native: C, api: string): C =>
    new Proxy(Native, {
      construct(target, args: unknown[], newTarget) {
        const url = args[0] as string | URL;
        if (!allowed(url)) throw block(api, url);
        return Reflect.construct(target, args, newTarget) as object;
      },
    });
  if (win.EventSource) win.EventSource = wrapCtor(win.EventSource, "EventSource");
  if (win.WebSocket) win.WebSocket = wrapCtor(win.WebSocket, "WebSocket");

  const nav = win.navigator;
  if (typeof nav.sendBeacon === "function") {
    const nativeBeacon = nav.sendBeacon.bind(nav);
    nav.sendBeacon = (url: string | URL, data?: BodyInit | null) => {
      if (allowed(url)) return nativeBeacon(url, data);
      block("sendBeacon", url);
      return false;
    };
  }

  const xhrProto = win.XMLHttpRequest?.prototype;
  if (xhrProto) {
    const nativeOpen = xhrProto.open as (this: XMLHttpRequest, ...args: unknown[]) => void;
    xhrProto.open = function open(this: XMLHttpRequest, ...args: unknown[]) {
      const url = args[1] as string | URL;
      if (!allowed(url)) throw block("XMLHttpRequest", url);
      return nativeOpen.apply(this, args);
    } as XMLHttpRequest["open"];
  }
}
