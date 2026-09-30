import { describe, expect, it } from "vitest";
import { isAllowed, parseAllowlist } from "@/server/channels/allowlist";

describe("real delivery allowlist", () => {
  const list = parseAllowlist("+91 98765 43210, Team.Lead+demo@Gmail.com, 123456789, junk");

  it("allows only listed numbers on WhatsApp and SMS, in any format", () => {
    expect(isAllowed(list, "whatsapp", "+919876543210", new Set())).toBe(true);
    expect(isAllowed(list, "sms", "09876543210", new Set())).toBe(true);
    expect(isAllowed(list, "whatsapp", "+919876543211", new Set())).toBe(false);
    expect(isAllowed(list, "whatsapp", "", new Set())).toBe(false);
  });

  it("matches emails after normalising", () => {
    expect(isAllowed(list, "email", "teamlead@gmail.com", new Set())).toBe(true);
    expect(isAllowed(list, "email", "someone@example.com", new Set())).toBe(false);
  });

  it("allows listed and linked Telegram chats only", () => {
    expect(isAllowed(list, "telegram", "123456789", new Set())).toBe(true);
    expect(isAllowed(list, "telegram", "555", new Set(["555"]))).toBe(true);
    expect(isAllowed(list, "telegram", "556", new Set(["555"]))).toBe(false);
  });

  it("sends nothing real when the list is empty", () => {
    const empty = parseAllowlist("");
    expect(isAllowed(empty, "whatsapp", "+919876543210", new Set())).toBe(false);
    expect(isAllowed(empty, "in_app", "x", new Set())).toBe(false);
  });
});
