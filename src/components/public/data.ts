import "server-only";
import type { PublicEventResponse, PublicStatusResponse } from "@/contracts";
import { CHARITY_SLUG, fixtures, HACKNOVA_SLUG } from "@/contracts/fixtures";
import { publicEvent, publicStatus } from "@/contracts/fixtures/responses";

/**
 * The one place public pages get their data. Until src/lib/api-client.ts lands (issue #29) this
 * reads the contract fixtures; then only this file changes. `source` lets pages say honestly
 * when they are showing seeded demo data.
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
