import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatRange,
  formatRelative,
  formatTime,
  istDateKey,
  istDayBounds,
  istToUtc,
  isWithinIstHours,
  toIstInputValue,
  toIstParts,
} from "@/lib/time";

describe("time helpers (UTC stored, IST displayed)", () => {
  // 24 Oct 2026 04:30 UTC is 10:00 IST
  const t = "2026-10-24T04:30:00.000Z";

  it("reads IST wall clock parts", () => {
    expect(toIstParts(t)).toMatchObject({ year: 2026, month: 10, day: 24, hour: 10, minute: 0, weekday: 6 });
  });

  it("formats date, time and date time in IST", () => {
    expect(formatDate(t)).toBe("24 Oct 2026");
    expect(formatTime(t)).toBe("10:00 AM");
    expect(formatTime("2026-10-24T18:45:00Z")).toBe("12:15 AM");
    expect(formatTime("2026-10-24T06:30:00Z")).toBe("12:00 PM");
    expect(formatDateTime(t)).toBe("24 Oct 2026, 10:00 AM");
  });

  it("crosses the date line correctly", () => {
    // 19:00 UTC on the 24th is 00:30 IST on the 25th
    expect(istDateKey("2026-10-24T19:00:00Z")).toBe("2026-10-25");
  });

  it("converts IST input back to UTC", () => {
    expect(istToUtc("2026-10-24T10:00").toISOString()).toBe(t);
    expect(istToUtc("2026-10-24").toISOString()).toBe("2026-10-23T18:30:00.000Z");
    expect(toIstInputValue(t)).toBe("2026-10-24T10:00");
    expect(() => istToUtc("24/10/2026")).toThrow(RangeError);
  });

  it("computes IST day bounds", () => {
    const { start, end } = istDayBounds(t);
    expect(start.toISOString()).toBe("2026-10-23T18:30:00.000Z");
    expect(end.toISOString()).toBe("2026-10-24T18:30:00.000Z");
  });

  it("formats ranges", () => {
    expect(formatRange(t, "2026-10-24T05:15:00Z")).toBe("10:00 AM - 10:45 AM");
    expect(formatRange(t, "2026-10-25T05:15:00Z")).toBe("24 Oct 2026, 10:00 AM - 25 Oct 2026, 10:45 AM");
  });

  it("formats relative time", () => {
    const now = "2026-10-24T04:30:00Z";
    expect(formatRelative("2026-10-24T04:45:00Z", now)).toBe("in 15 min");
    expect(formatRelative("2026-10-24T01:30:00Z", now)).toBe("3 h ago");
    expect(formatRelative("2026-10-24T04:30:10Z", now)).toBe("just now");
  });

  it("detects the 22:00 to 07:00 IST quiet window", () => {
    expect(isWithinIstHours("2026-10-24T16:30:00Z")).toBe(true); // 22:00 IST
    expect(isWithinIstHours("2026-10-24T01:29:00Z")).toBe(true); // 06:59 IST
    expect(isWithinIstHours("2026-10-24T01:30:00Z")).toBe(false); // 07:00 IST
    expect(isWithinIstHours("2026-10-24T16:29:00Z")).toBe(false); // 21:59 IST
  });
});
