import { describe, expect, it } from "vitest";
import type { BudgetCategory, LedgerEntry, Room } from "@/contracts";
import { classify, confusion, roomIn, topicOf } from "@/agents/radar/detect";
import { reallocate, spentBy } from "@/agents/finance/config";

const q = (text: string, i: number) => ({
  messageId: `m${i}`,
  text,
  at: `2026-10-24T05:0${i % 10}:00.000Z`,
  channel: "in_app",
});

describe("Radar detectors", () => {
  it("groups English and Hinglish questions by topic", () => {
    expect(topicOf("lunch kahan milega?")?.key).toBe("food");
    expect(topicOf("bhai khana kidhar hai")?.key).toBe("food");
    expect(topicOf("What is the wifi password")?.key).toBe("wifi");
    expect(topicOf("Who is the keynote speaker?")).toBeUndefined();
  });

  it("raises confusion only at the threshold", () => {
    const seven = Array.from({ length: 7 }, (_, i) => q("Where is lunch?", i));
    expect(confusion(seven)).toBeNull();
    const eight = [...seven, q("khana kidhar hai", 7), q("wifi password?", 8)];
    expect(confusion(eight)).toMatchObject({ topic: { key: "food" } });
    expect(confusion(eight)!.questions).toHaveLength(8);
  });

  it("finds the room in a Hinglish voice note and sends AV problems to AV", () => {
    const rooms = [
      { id: "r1", name: "Main Auditorium" },
      { id: "r2", name: "Lab 204" },
    ] as Room[];
    const t = "Lab 204 ka projector kaam nahi kar raha";
    expect(roomIn(t, rooms)?.id).toBe("r2");
    expect(roomIn("204 mein screen band hai", rooms)?.id).toBe("r2");
    expect(classify(t)).toEqual({ category: "av", skill: "av_tech" });
    expect(classify("someone fainted near the stage").category).toBe("medical");
  });
});

describe("Finance reallocation", () => {
  const cats = [
    { id: "c", key: "catering", name: "Catering", capInr: 100_000 },
    { id: "p", key: "prizes", name: "Prizes", capInr: 50_000 },
    { id: "m", key: "marketing", name: "Marketing", capInr: 20_000 },
  ] as BudgetCategory[];
  const e = (categoryId: string, amountInr: number, status = "committed") =>
    ({ type: "expense", categoryId, amountInr, status }) as LedgerEntry;

  it("moves the overage, rounded up to 1,000, from the most headroom, keeping the total", () => {
    const spent = spentBy([e("c", 103_500), e("p", 10_000), e("m", 5_000)]);
    const r = reallocate(cats, spent, "c")!;
    expect(r.moved).toBe(4_000);
    expect(r.moves.map((m) => m.from.key)).toEqual(["prizes"]);
    expect(r.caps.get("c")).toBe(104_000);
    expect(r.caps.get("p")).toBe(46_000);
    expect([...r.caps.values()].reduce((a, b) => a + b, 0)).toBe(170_000);
  });

  it("gives up when the others cannot cover it, and ignores money not spent", () => {
    const spent = spentBy([e("c", 180_000), e("p", 49_000), e("m", 19_500), e("m", 9_000, "due")]);
    expect(reallocate(cats, spent, "c")).toBeNull();
    expect(spent.get("m")).toBe(19_500);
  });
});
