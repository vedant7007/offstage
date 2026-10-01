import { isShowcase } from "@/showcase/flag";

// Runs once when a Next.js server starts.
export async function register() {
  // The showcase has no database and no demo clock to sync.
  if (process.env.NEXT_RUNTIME === "nodejs" && !isShowcase()) {
    const { startDemoClockSync } = await import("@/server/clock");
    startDemoClockSync();
    const [{ useSpendStore: installSpendStore }, { dbSpendStore }] = await Promise.all([
      import("@/ai/router"),
      import("@/server/services/spend"),
    ]);
    installSpendStore(dbSpendStore());
  }
}
