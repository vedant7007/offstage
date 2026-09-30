/**
 * Email sending. EMAIL_DRIVER picks the driver:
 *   mailpit  SMTP to the local Mailpit container (web inbox on :8025)
 *   smtp     any SMTP server from SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS. Amazon SES in the cloud:
 *            email-smtp.<region>.amazonaws.com:587 with SES SMTP credentials (pnpm ses:smtp-password)
 *   mock     log only (names and subjects, never addresses or bodies)
 */
import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "@/lib/logger";
import { maskEmail } from "@/lib/format";

const log = logger.child({ module: "channels.email" });

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Short tag for logs and metrics, e.g. "otp". Never put personal data here. */
  kind: string;
}

export interface EmailResult {
  providerId?: string;
  driver: string;
}

let transport: Transporter | undefined;

function smtp(): Transporter {
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "localhost",
    port: Number(process.env.SMTP_PORT ?? 1025),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" }
      : undefined,
  });
  return transport;
}

export async function sendEmail(msg: EmailMessage): Promise<EmailResult> {
  const driver = process.env.EMAIL_DRIVER ?? "mailpit";
  const from = process.env.EMAIL_FROM ?? "Sutradhar <no-reply@sutradhar.local>";
  if (driver === "mock") {
    log.info({ kind: msg.kind, to: maskEmail(msg.to) }, "email (mock driver, not sent)");
    return { driver };
  }
  if (driver === "mailpit" || driver === "smtp") {
    const info = await smtp().sendMail({
      from,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    });
    log.info({ kind: msg.kind, to: maskEmail(msg.to) }, "email sent");
    return { driver, providerId: info.messageId };
  }
  throw new Error(`EMAIL_DRIVER=${driver} is not available yet; use smtp, mailpit or mock`);
}
