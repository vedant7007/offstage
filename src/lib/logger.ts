import pino, { type DestinationStream, type Logger, type LoggerOptions } from "pino";

/**
 * Structured logger with PII redaction. Never log raw personal data on purpose;
 * redaction is the safety net, not the plan.
 *
 * Fields matched at the top level, one level deep and two levels deep
 * (for example `email`, `user.email`, `payload.attendee.email`) are replaced.
 */
const PII_KEYS = [
  "email",
  "phone",
  "name",
  "fullName",
  "address",
  "rollNo",
  "emailEnc",
  "phoneEnc",
  "otp",
  "password",
  "token",
  "secret",
  "authorization",
  "cookie",
];

export const REDACT_PATHS: string[] = [
  ...PII_KEYS,
  ...PII_KEYS.map((k) => `*.${k}`),
  ...PII_KEYS.map((k) => `*.*.${k}`),
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["x-twilio-signature"]',
  'res.headers["set-cookie"]',
];

export const REDACTED = "[redacted]";

function baseOptions(): LoggerOptions {
  return {
    level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info"),
    base: { service: process.env.SUTRADHAR_SERVICE ?? "web" },
    redact: { paths: REDACT_PATHS, censor: REDACTED },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
  };
}

/** Build a logger. Tests pass a destination stream to capture output. */
export function createLogger(options: Partial<LoggerOptions> = {}, destination?: DestinationStream): Logger {
  const opts = { ...baseOptions(), ...options };
  return destination ? pino(opts, destination) : pino(opts);
}

const globalForLogger = globalThis as unknown as { __sutradharLogger?: Logger };

/** Shared process logger. Use `logger.child({ module: "..." })` per module. */
export const logger: Logger = globalForLogger.__sutradharLogger ?? createLogger();
if (process.env.NODE_ENV !== "production") globalForLogger.__sutradharLogger = logger;
