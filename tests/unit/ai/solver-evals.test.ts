import { describe, expect, it } from "vitest";
import { solverChecks } from "@/ai/evals/golden";

describe("solver evals", () => {
  it("re-checks every option for every possible cancellation and all pass", () => {
    const r = solverChecks();
    expect(r.checked).toBeGreaterThan(10);
    expect(r.failures).toEqual([]);
    expect(r.passRate).toBe(1);
  });
});
