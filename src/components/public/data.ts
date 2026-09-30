import "server-only";
import type { CertificateVerifyResponse, PublicEventResponse, PublicStatusResponse } from "@/contracts";
import { CHARITY_SLUG, fixtures, HACKNOVA_SLUG } from "@/contracts/fixtures";
import { certificateVerify, publicEvent, publicStatus } from "@/contracts/fixtures/responses";

/**
 * The one place public pages get their data. Until the public API routes are on main (issue #62)
 * this reads the contract fixtures; then only this file changes to `api.*` from
 * src/lib/api-client.ts. `source` lets pages say honestly when they are showing seeded demo data.
 */
export type Sourced<T> = { data: T; source: "fixture" | "api" };

function worldFor(slug: string) {
  if (slug === HACKNOVA_SLUG) return fixtures.eventFull();
  if (slug === CHARITY_SLUG) return fixtures.charityDrive();
  return null;
}

export async function getPublicEvent(slug: string): Promise<Sourced<PublicEventResponse> | null> {
  const world = worldFor(slug);
  return world ? { data: publicEvent(world), source: "fixture" } : null;
}

export async function getPublicStatus(slug: string): Promise<Sourced<PublicStatusResponse> | null> {
  const world = worldFor(slug);
  return world ? { data: publicStatus(world), source: "fixture" } : null;
}

/** Unknown ids answer like the API does: `valid: false` with no certificate. */
export async function getCertificate(certId: string): Promise<Sourced<CertificateVerifyResponse>> {
  const world = fixtures.eventFull();
  if (certId === fixtures.certificate().id)
    return { data: certificateVerify(world, false), source: "fixture" };
  if (certId === fixtures.certificate(true).id)
    return { data: certificateVerify(world, true), source: "fixture" };
  return { data: { valid: false, certificate: null }, source: "fixture" };
}
