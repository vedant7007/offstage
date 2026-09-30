// Runs once when a Next.js server starts.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startDemoClockSync } = await import("@/server/clock");
    startDemoClockSync();
    const [{ useSpendStore: installSpendStore }, { dbSpendStore }] = await Promise.all([
      import("@/ai/router"),
      import("@/server/services/spend"),
    ]);
    installSpendStore(dbSpendStore());
  }
}
