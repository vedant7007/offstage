import { describe, expect, it } from "vitest";
import { bounded } from "@/ai/router/router";

describe("bounded", () => {
  it("gives up at the timeout even when the work never settles", async () => {
    const never = new Promise<string>(() => undefined);
    await expect(bounded(never, AbortSignal.timeout(20))).rejects.toMatchObject({ name: "TimeoutError" });
  });
  it("returns the work's result when it is in time", async () => {
    await expect(bounded(Promise.resolve("ok"), AbortSignal.timeout(1000))).resolves.toBe("ok");
  });
});
