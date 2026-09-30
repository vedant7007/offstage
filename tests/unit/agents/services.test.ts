import { describe, expect, it } from "vitest";
import { fixtures } from "@/contracts/fixtures";
import { snapshot, worldServices } from "@/agents/runtime/services";
import { detectClashes } from "@/solvers/schedule";

describe("worldServices", () => {
  it("never hands raw email or phone to agent tools", async () => {
    const world = fixtures.eventFull();
    const s = worldServices(world);
    const out = JSON.stringify([await s.registrations({ limit: 500 }), await s.speakers()]);
    for (const r of world.registrations) {
      expect(out).not.toContain(r.email);
      if (r.phone) expect(out).not.toContain(r.phone);
    }
    for (const sp of world.speakers) if (sp.email) expect(out).not.toContain(sp.email);
  });

  it("snapshot is isolated from the source world", async () => {
    const world = fixtures.eventFull();
    const snap = snapshot(world);
    (await snap.sessions())[0]!.title = "changed in a what-if";
    expect(world.sessions[0]!.title).not.toBe("changed in a what-if");
  });

  it("the schedule solver finds the seeded tensions in HackNova", async () => {
    const s = worldServices(fixtures.eventFull());
    const rooms = await s.rooms();
    const clashes = detectClashes({
      sessions: await s.sessions(),
      rooms,
      choices: await s.sessionChoices(),
    });
    const lab204 = rooms.find((r) => r.name === "Lab 204")!;
    expect(clashes).toContainEqual(
      expect.objectContaining({ type: "over_capacity", roomId: lab204.id, capacity: 60, registered: 95 }),
    );
    expect(clashes.some((c) => c.type === "speaker_double_booked")).toBe(true);
  });
});
