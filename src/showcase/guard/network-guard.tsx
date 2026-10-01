"use client";

import { isShowcase } from "@/showcase/flag";
import { installNetworkGuard } from "./network";

// Installed when this module first evaluates in the browser, before any component effect runs.
if (typeof window !== "undefined" && isShowcase()) {
  installNetworkGuard(window, process.env.NODE_ENV === "development");
}

/** Mounted from the root layout so the guard module loads on every route. Renders nothing. */
export function NetworkGuard() {
  return null;
}
