/**
 * Which driver delivers each channel, from env. Drivers themselves arrive with the channel
 * adapters (Checkpoint 6); without credentials every channel falls back to `mock`, which logs
 * and marks the outbox row sent so the demo flow still completes.
 */
import type { Channel } from "@/contracts";

export type DriverName =
  "in_app" | "mailpit" | "smtp" | "ses" | "resend" | "telegram" | "twilio-whatsapp" | "twilio-sms" | "mock";

export function driverFor(channel: Channel): DriverName {
  switch (channel) {
    case "in_app":
      return "in_app";
    case "email": {
      const d = process.env.EMAIL_DRIVER;
      return d === "ses" || d === "resend" || d === "mailpit" || d === "smtp" ? d : "mock";
    }
    case "telegram":
      return process.env.TELEGRAM_BOT_TOKEN ? "telegram" : "mock";
    case "whatsapp":
      return process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_WHATSAPP_FROM
        ? "twilio-whatsapp"
        : "mock";
    case "sms":
      return process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_SMS_FROM
        ? "twilio-sms"
        : "mock";
  }
}
