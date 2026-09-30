/**
 * Demo inbox: a fallback for live demos when a real inbox is slow. With DEMO_MODE on, OTP emails
 * to a seeded persona or to an address in DEMO_REAL_RECIPIENTS also land in the server's Mailpit,
 * and the OTP screen can link to that person's latest one. Every other address, and every address
 * with DEMO_MODE off, is refused.
 *
 * Seeded persona addresses (@sutradhar.test) go to Mailpit only: a real provider would bounce them.
 * Note: anyone who types an eligible address can read its code. That is the point for personas
 * (the persona switcher already signs in as them); for the team's real addresses it is a demo-only
 * trade-off, which is why the allowlist is opt-in per address.
 */
import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "@/lib/logger";
import { demoModeOn, PERSONA_EMAILS } from "@/server/auth/personas";
import { normaliseEmail } from "@/server/pii";
import { parseAllowlist } from "./allowlist";

const log = logger.child({ module: "channels.demo-inbox" });

const personas = () => new Set(Object.values(PERSONA_EMAILS).map(normaliseEmail));

export const isPersonaEmail = (email: string) => personas().has(normaliseEmail(email));

export function demoInboxAllowed(email: string): boolean {
  if (!demoModeOn()) return false;
  const e = normaliseEmail(email);
  return personas().has(e) || parseAllowlist().emails.has(e);
}

/** Mailpit's SMTP and HTTP addresses. In the cloud Compose network: mailpit:1025 and http://mailpit:8025. */
const smtpHost = () => process.env.MAILPIT_SMTP_HOST ?? "localhost";
const smtpPort = () => Number(process.env.MAILPIT_SMTP_PORT_INTERNAL ?? 1025);
const apiUrl = () => process.env.MAILPIT_URL ?? "http://localhost:8025";

let transport: Transporter | undefined;

/** Put a copy in Mailpit. Failures are logged, never thrown: the real send decides the outcome. */
export async function copyToDemoInbox(msg: {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<void> {
  transport ??= nodemailer.createTransport({ host: smtpHost(), port: smtpPort(), secure: false });
  try {
    await transport.sendMail(msg);
  } catch (err) {
    log.warn({ err: String(err) }, "demo inbox copy failed");
  }
}

export interface DemoInboxMessage {
  subject: string;
  text: string;
  receivedAt: string;
}

/** The latest message to this address in Mailpit, or null. Callers check demoInboxAllowed first. */
export async function latestDemoMessage(email: string): Promise<DemoInboxMessage | null> {
  const q = encodeURIComponent(`to:"${email.trim()}"`);
  const res = await fetch(`${apiUrl()}/api/v1/search?query=${q}&limit=1`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`mailpit search ${res.status}`);
  const found = (await res.json()) as { messages?: { ID: string }[] };
  const id = found.messages?.[0]?.ID;
  if (!id) return null;
  const msg = await fetch(`${apiUrl()}/api/v1/message/${id}`, { signal: AbortSignal.timeout(5000) });
  if (!msg.ok) throw new Error(`mailpit message ${msg.status}`);
  const m = (await msg.json()) as { Subject: string; Text: string; Date: string };
  return { subject: m.Subject, text: m.Text, receivedAt: m.Date };
}
