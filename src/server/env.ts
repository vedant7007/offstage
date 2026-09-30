import { z } from "zod";

/**
 * Server environment. Parsed once, lazily, so importing this module in a test or
 * a script that does not need every variable does not crash.
 * Every variable here is documented in .env.example.
 */
const bool = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v === "" ? undefined : v));

export const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url(),
  DATABASE_APP_ROLE: optionalString,
  APP_URL: z.url().default("http://localhost:3000"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DEMO_MODE: bool,

  AUTH_SECRET: optionalString,
  TICKET_SIGNING_PRIVATE_KEY: optionalString,
  TICKET_SIGNING_PUBLIC_KEY: optionalString,
  PII_ENCRYPTION_KEY: optionalString,

  EMAIL_DRIVER: z.enum(["mailpit", "ses", "resend", "mock"]).default("mailpit"),
  EMAIL_FROM: z.string().default("Sutradhar <no-reply@sutradhar.local>"),
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_USER: optionalString,
  SMTP_PASS: optionalString,
  SMTP_SECURE: bool,
  RESEND_API_KEY: optionalString,

  AWS_REGION: optionalString,
  AWS_ACCESS_KEY_ID: optionalString,
  AWS_SECRET_ACCESS_KEY: optionalString,

  TELEGRAM_BOT_TOKEN: optionalString,
  TWILIO_ACCOUNT_SID: optionalString,
  TWILIO_AUTH_TOKEN: optionalString,
  TWILIO_WHATSAPP_FROM: optionalString,
  TWILIO_SMS_FROM: optionalString,

  TURNSTILE_SITE_KEY: optionalString,
  TURNSTILE_SECRET_KEY: optionalString,
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = EnvSchema.safeParse(process.env);
    if (!parsed.success) {
      // Only variable names are printed, never values.
      const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
      throw new Error(`Invalid or missing environment variables: ${names}. See .env.example.`);
    }
    cached = parsed.data;
  }
  return cached;
}
