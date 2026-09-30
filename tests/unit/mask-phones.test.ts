import { describe, expect, it } from "vitest";
import { maskPhones } from "@/lib/format";

describe("persona feed masking", () => {
  it("keeps only the last 4 digits of any phone number in message text", () => {
    expect(maskPhones("Call +919876543210 or 98765 43210 now")).toBe("Call +91 ******3210 or ******3210 now");
  });
  it("leaves times, dates and short numbers alone", () => {
    const text = "Hall 3 at 4:00 PM, Sat, 24 Oct 2026, table 12";
    expect(maskPhones(text)).toBe(text);
  });
});
