import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { REDACTED, createLogger } from "@/lib/logger";

function capture() {
  const lines: Record<string, unknown>[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(JSON.parse(String(chunk)) as Record<string, unknown>);
      cb();
    },
  });
  return { lines, logger: createLogger({ level: "info" }, stream) };
}

function at(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj);
}

describe("logger redaction", () => {
  it("redacts PII at the top level and nested payloads", () => {
    const { lines, logger } = capture();
    logger.info(
      {
        email: "sneha@example.com",
        registration: { phone: "+919876543210", name: "Sneha Reddy", id: "reg_1" },
        payload: { attendee: { email: "x@y.z", rollNo: "22B81A0501" } },
        req: { headers: { authorization: "Bearer abc", cookie: "session=1" } },
      },
      "registration created",
    );
    const line = lines[0];
    expect(at(line, "email")).toBe(REDACTED);
    expect(at(line, "registration.phone")).toBe(REDACTED);
    expect(at(line, "registration.name")).toBe(REDACTED);
    expect(at(line, "registration.id")).toBe("reg_1");
    expect(at(line, "payload.attendee.email")).toBe(REDACTED);
    expect(at(line, "payload.attendee.rollNo")).toBe(REDACTED);
    expect(at(line, "req.headers.authorization")).toBe(REDACTED);
    expect(at(line, "req.headers.cookie")).toBe(REDACTED);
    expect(JSON.stringify(line)).not.toContain("sneha@example.com");
    expect(JSON.stringify(line)).not.toContain("9876543210");
  });

  it("keeps error codes readable", () => {
    const { lines, logger } = capture();
    const err = Object.assign(new Error("connect failed"), { code: "ECONNREFUSED" });
    logger.error({ err }, "db down");
    const line = lines[0] as { err: { code: string; message: string } };
    expect(line.err.code).toBe("ECONNREFUSED");
    expect(line.err.message).toBe("connect failed");
  });
});
