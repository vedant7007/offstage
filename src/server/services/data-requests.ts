/**
 * "Export my data" and "delete my data" requests (DPDP). This only records the request against
 * the person's own registration; staff carry it out, since exporting or deleting personal data
 * is T3. Asking twice while a request of that type is open returns the open one.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { UserActor } from "@/contracts";
import type { DataRequestCreate, DataRequestResponse } from "@/contracts/api";
import { db } from "@/db/client";
import { dataRequests, registrations } from "@/db/schema";
import { requirePermission } from "@/server/authz";
import { audit } from "@/server/events/bus";

export async function createDataRequest(
  actor: UserActor,
  input: DataRequestCreate,
): Promise<DataRequestResponse> {
  requirePermission(actor, "data.request", { eventId: actor.eventId });
  return db.transaction(async (tx) => {
    const [open] = await tx
      .select({ id: dataRequests.id, status: dataRequests.status })
      .from(dataRequests)
      .where(
        and(
          eq(dataRequests.eventId, actor.eventId),
          eq(dataRequests.userId, actor.userId),
          eq(dataRequests.type, input.type),
          inArray(dataRequests.status, ["received", "approved"]),
        ),
      )
      .limit(1);
    if (open) return { requestId: open.id, status: open.status };

    const [reg] = await tx
      .select({ id: registrations.id })
      .from(registrations)
      .where(and(eq(registrations.eventId, actor.eventId), eq(registrations.userId, actor.userId)))
      .limit(1);
    const [row] = await tx
      .insert(dataRequests)
      .values({
        eventId: actor.eventId,
        userId: actor.userId,
        registrationId: reg?.id ?? null,
        type: input.type,
        note: input.note ?? null,
      })
      .returning({ id: dataRequests.id, status: dataRequests.status });
    await audit(tx, {
      eventId: actor.eventId,
      actor,
      action: `data_request.${input.type}`,
      entity: "data_requests",
      entityId: row!.id,
      after: { type: input.type, registrationId: reg?.id ?? null },
    });
    return { requestId: row!.id, status: row!.status };
  });
}
