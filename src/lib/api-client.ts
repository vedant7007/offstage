/**
 * Typed client for every endpoint in ENDPOINTS (src/contracts/api.ts). Request bodies and
 * responses are validated with the contract schemas, so a drifting server fails loudly here.
 *
 *   import { api } from "@/lib/api-client";
 *   const ev = await api.publicEvent("hacknova-2026");
 *
 * Mock mode (NEXT_PUBLIC_API_MOCK=1, or createApiClient({ mock: true })) answers from the
 * contract fixtures with no backend. Fixtures load lazily, so faker never reaches a normal bundle.
 */
import type { z } from "zod";
import { ApiError, ChatStreamChunk, ENDPOINTS, type ApiErrorCode, type EndpointName } from "@/contracts/api";

type Endpoints = typeof ENDPOINTS;
type EP<N extends EndpointName> = Endpoints[N];

/** ":slug" and ":eventId" style params in a path template. */
type PathParamNames<S extends string> = S extends `${string}:${infer P}/${infer Rest}`
  ? P | PathParamNames<`/${Rest}`>
  : S extends `${string}:${infer P}`
    ? P
    : never;

export type PathParams<N extends EndpointName> = Record<PathParamNames<EP<N>["path"]>, string>;
export type Body<N extends EndpointName> =
  EP<N> extends { body: infer B extends z.ZodType } ? z.input<B> : undefined;
export type Query<N extends EndpointName> =
  EP<N> extends { query: infer Q extends z.ZodType } ? z.input<Q> : undefined;
export type ApiResponse<N extends EndpointName> = z.infer<EP<N>["response"]>;

export type CallArgs<N extends EndpointName> = ([PathParamNames<EP<N>["path"]>] extends [never]
  ? { params?: undefined }
  : { params: PathParams<N> }) &
  (Body<N> extends undefined ? { body?: undefined } : { body: Body<N> }) &
  (Query<N> extends undefined ? { query?: undefined } : { query?: Query<N> });

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode | "network" | "invalid_response",
    message: string,
    readonly issues?: { path: string; message: string }[],
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export interface ApiClientOptions {
  /** Origin to call. Defaults to "" in the browser and APP_URL on the server. */
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Extra headers, e.g. forwarding the cookie from a server component. */
  headers?: Record<string, string>;
  mock?: boolean;
}

export function buildPath(template: string, params: Record<string, string> = {}): string {
  return template.replace(/:([A-Za-z]+)/g, (_, name: string) => {
    const v = params[name];
    if (v === undefined || v === "") throw new Error(`Missing path param "${name}" for ${template}`);
    return encodeURIComponent(v);
  });
}

function queryString(query: Record<string, unknown> | undefined): string {
  if (!query) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) for (const item of v) sp.append(k, String(item));
    else sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

function defaultBaseUrl(): string {
  if (typeof window !== "undefined") return "";
  return process.env.APP_URL ?? "http://localhost:3000";
}

function mockEnabled(opt: boolean | undefined): boolean {
  if (opt !== undefined) return opt;
  return process.env.NEXT_PUBLIC_API_MOCK === "1" || process.env.NEXT_PUBLIC_API_MOCK === "true";
}

async function readError(res: globalThis.Response): Promise<ApiClientError> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = undefined;
  }
  const parsed = ApiError.safeParse(body);
  if (parsed.success) {
    const e = parsed.data.error;
    return new ApiClientError(res.status, e.code, e.message, e.issues, e.retryAfterSeconds);
  }
  return new ApiClientError(
    res.status,
    res.status === 401 ? "unauthenticated" : "internal",
    `Request failed with ${res.status}`,
  );
}

export function createApiClient(options: ApiClientOptions = {}) {
  const doFetch = options.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const base = options.baseUrl ?? defaultBaseUrl();
  const isMock = mockEnabled(options.mock);

  function urlFor<N extends EndpointName>(
    name: N,
    params?: Record<string, string>,
    query?: Record<string, unknown>,
  ) {
    return `${base}${buildPath(ENDPOINTS[name].path, params)}${queryString(query)}`;
  }

  async function request<N extends EndpointName>(name: N, args: CallArgs<N>): Promise<globalThis.Response> {
    const ep = ENDPOINTS[name] as {
      method: string;
      body?: z.ZodType;
      query?: z.ZodType;
      stream?: "sse" | "ndjson";
    };
    const a = args as { params?: Record<string, string>; body?: unknown; query?: Record<string, unknown> };
    const body = ep.body ? ep.body.parse(a.body) : undefined;
    const query = ep.query && a.query ? (ep.query.parse(a.query) as Record<string, unknown>) : undefined;
    let res: globalThis.Response;
    try {
      res = await doFetch(urlFor(name, a.params, query), {
        method: ep.method,
        credentials: "include",
        headers: {
          accept: ep.stream === "sse" ? "text/event-stream" : "application/json",
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
          ...options.headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw new ApiClientError(0, "network", err instanceof Error ? err.message : "Network error");
    }
    if (!res.ok) throw await readError(res);
    return res;
  }

  /** Call any endpoint by name. Validates the request and the response. */
  async function call<N extends EndpointName>(
    name: N,
    ...rest: CallArgs<N> extends { params?: undefined; body?: undefined } ? [CallArgs<N>?] : [CallArgs<N>]
  ): Promise<ApiResponse<N>> {
    const args = (rest[0] ?? {}) as CallArgs<N>;
    if (isMock) {
      const { mockCall } = await import("./api-client.mock");
      return ENDPOINTS[name].response.parse(await mockCall(name, args as never)) as ApiResponse<N>;
    }
    const res = await request(name, args);
    const json: unknown = await res.json();
    const parsed = ENDPOINTS[name].response.safeParse(json);
    if (!parsed.success) {
      throw new ApiClientError(
        res.status,
        "invalid_response",
        `Response from ${name} does not match the contract`,
      );
    }
    return parsed.data as ApiResponse<N>;
  }

  /** Helpdesk chat: yields delta chunks, then one done (or error) chunk. */
  async function* chat(body: Body<"chat">): AsyncGenerator<z.infer<typeof ChatStreamChunk>> {
    if (isMock) {
      const { mockChat } = await import("./api-client.mock");
      yield* mockChat(body);
      return;
    }
    const res = await request("chat", { body } as CallArgs<"chat">);
    if (!res.body) throw new ApiClientError(res.status, "invalid_response", "Chat response has no body");
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) yield ChatStreamChunk.parse(JSON.parse(line));
      }
    }
    if (buf.trim()) yield ChatStreamChunk.parse(JSON.parse(buf));
  }

  /** URL for an SSE endpoint, to pass to EventSource. Mock mode returns null (poll instead). */
  function streamUrl(name: "stream" | "publicStatusStream", params: Record<string, string>): string | null {
    return isMock ? null : urlFor(name, params);
  }

  return {
    call,
    chat,
    streamUrl,
    mock: isMock,

    // public
    publicEvent: (slug: string) => call("publicEvent", { params: { slug } }),
    publicStatus: (slug: string) => call("publicStatus", { params: { slug } }),
    otpRequest: (slug: string, body: Body<"otpRequest">) => call("otpRequest", { params: { slug }, body }),
    otpVerify: (slug: string, body: Body<"otpVerify">) => call("otpVerify", { params: { slug }, body }),
    register: (slug: string, body: Body<"register">) => call("register", { params: { slug }, body }),
    speakerForm: (slug: string, token: string, body: Body<"speakerForm">) =>
      call("speakerForm", { params: { slug, token }, body }),
    volunteerSignup: (slug: string, body: Body<"volunteerSignup">) =>
      call("volunteerSignup", { params: { slug }, body }),
    verifyCertificate: (certId: string) => call("verifyCertificate", { params: { certId } }),
    verifyKey: (slug: string) => call("verifyKey", { params: { slug } }),
    revocations: (slug: string) => call("revocations", { params: { slug } }),

    // attendee
    me: () => call("me"),
    myRegistration: () => call("myRegistration"),
    myTicket: () => call("myTicket"),
    mySchedule: () => call("mySchedule"),
    dataRequest: (body: Body<"dataRequest">) => call("dataRequest", { body }),

    // crew
    crewShifts: () => call("crewShifts"),
    crewShiftCheckin: (assignmentId: string) => call("crewShiftCheckin", { params: { assignmentId } }),
    crewCheckin: (body: Body<"crewCheckin">) => call("crewCheckin", { body }),
    crewCheckinSync: (body: Body<"crewCheckinSync">) => call("crewCheckinSync", { body }),
    crewSearch: (q: string) => call("crewSearch", { query: { q } }),
    crewIncident: (body: Body<"crewIncident">) => call("crewIncident", { body }),
    crewTasks: () => call("crewTasks"),
    crewTaskUpdate: (taskId: string, body: Body<"crewTaskUpdate">) =>
      call("crewTaskUpdate", { params: { taskId }, body }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** Shared client with default options. Server components that need the caller's cookie create their own. */
export const api: ApiClient = createApiClient();
