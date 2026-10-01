import "server-only";
import { headers } from "next/headers";
import type { MeResponse, MyRegistrationResponse, MyScheduleResponse, MyTicketResponse } from "@/contracts";
import { fixtures } from "@/contracts/fixtures";
import { ApiClientError, createApiClient } from "@/lib/api-client";

/**
 * Server-side data for the attendee portal. Calls the real API with the visitor's cookie.
 * While a route is not on main yet (issue #65), that one piece falls back to the contract
 * fixtures, but only for the seeded attendee whose real registration matches the fixture one,
 * so nobody is ever shown someone else's ticket. `source` lets pages say it is demo data.
 */
export type Sourced<T> = { data: T; source: "api" | "fixture" };

async function api() {
  const h = await headers();
  return createApiClient({ headers: { cookie: h.get("cookie") ?? "" } });
}

/** A route that does not exist yet answers with a plain 404 page, not an ApiError body. */
/** Layouts and pages render in parallel, so a page can run before the layout's sign-in redirect. */
const unauthenticated = (err: unknown) =>
  err instanceof ApiClientError && (err.status === 401 || err.code === "unauthenticated");

const routeMissing = (err: unknown) =>
  err instanceof ApiClientError && err.status === 404 && err.code !== "not_found";

export async function getMe(): Promise<MeResponse | null> {
  try {
    return await (await api()).me();
  } catch (err) {
    if (unauthenticated(err)) return null;
    throw err;
  }
}

export async function getMyRegistration(): Promise<MyRegistrationResponse["registration"]> {
  try {
    return (await (await api()).myRegistration()).registration;
  } catch (err) {
    if (unauthenticated(err)) return null;
    throw err;
  }
}

function isSeededAttendee(registrationId: string | undefined) {
  return !!registrationId && registrationId === fixtures.api.myRegistration().registration?.id;
}

export async function getMyTicket(
  registrationId: string | undefined,
): Promise<Sourced<MyTicketResponse> | null> {
  try {
    return { data: await (await api()).myTicket(), source: "api" };
  } catch (err) {
    if (routeMissing(err)) {
      return isSeededAttendee(registrationId) ? { data: fixtures.api.myTicket(), source: "fixture" } : null;
    }
    if (unauthenticated(err) || (err instanceof ApiClientError && err.code === "not_found")) return null;
    throw err;
  }
}

export async function getMySchedule(
  registrationId: string | undefined,
): Promise<Sourced<MyScheduleResponse> | null> {
  try {
    return { data: await (await api()).mySchedule(), source: "api" };
  } catch (err) {
    if (routeMissing(err)) {
      return isSeededAttendee(registrationId) ? { data: fixtures.api.mySchedule(), source: "fixture" } : null;
    }
    if (unauthenticated(err) || (err instanceof ApiClientError && err.code === "not_found")) return null;
    throw err;
  }
}

/** Event time for this request: real time plus the demo clock offset (see src/lib/time.ts). */
export function eventNow(me: MeResponse | null) {
  const clockOffsetMs = me?.clockOffsetMs ?? 0;
  return { clockOffsetMs, nowIso: new Date(Date.now() + clockOffsetMs).toISOString() };
}
