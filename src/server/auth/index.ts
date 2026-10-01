/**
 * Better Auth: email OTP sign-in, sessions in Postgres, httpOnly cookies.
 * Attendees, volunteers and staff all sign in the same way; their role comes from `memberships`.
 * Rate limits for OTP requests (per email and per IP) sit in front of this in
 * src/app/api/auth/[...all]/route.ts.
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins/email-otp";
import { db } from "@/db/client";
import { accounts, authSessions, users, verifications } from "@/db/schema";
import { otpEmail } from "@/server/channels/templates";
import { sendEmail } from "@/server/channels/email";
import { logger } from "@/lib/logger";
import { demoModeOn, demoPersonaPlugin } from "./demo-persona";

const log = logger.child({ module: "auth" });

export const OTP_TTL_SECONDS = 600;

function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}

function createAuth() {
  return betterAuth({
    appName: "Sutradhar",
    baseURL: appUrl(),
    basePath: "/api/auth",
    secret: process.env.AUTH_SECRET,
    trustedOrigins: [appUrl()],
    database: drizzleAdapter(db, {
      provider: "pg",
      usePlural: true,
      // Better Auth looks models up by these keys; the session table is auth_sessions.
      schema: { users, sessions: authSessions, accounts, verifications },
    }),
    emailAndPassword: { enabled: false },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      additionalFields: {
        activeEventId: { type: "string", required: false, input: false },
      },
    },
    advanced: {
      useSecureCookies: appUrl().startsWith("https://"),
      cookiePrefix: "sutradhar",
      database: { generateId: () => globalThis.crypto.randomUUID() },
    },
    // Our own limiter in the route handler enforces the per-email and per-IP OTP limits.
    rateLimit: { enabled: false },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: OTP_TTL_SECONDS,
        allowedAttempts: 3,
        storeOTP: "hashed",
        async sendVerificationOTP({ email, otp, type }) {
          const mail = otpEmail({ otp, minutes: OTP_TTL_SECONDS / 60, purpose: type });
          // Not awaited, so response time does not reveal whether the address exists.
          void sendEmail({ to: email, ...mail, kind: "otp" }).catch((err: unknown) =>
            log.error({ err }, "failed to send OTP email"),
          );
        },
      }),
      ...(demoModeOn() ? [demoPersonaPlugin()] : []),
      nextCookies(),
    ],
  });
}

let instance: ReturnType<typeof createAuth> | undefined;

/**
 * Built on first use, not at import, so `next build` (and the showcase, which never signs in)
 * needs no AUTH_SECRET or database.
 */
export const auth = new Proxy({} as ReturnType<typeof createAuth>, {
  get: (_t, prop) => Reflect.get((instance ??= createAuth()), prop) as unknown,
  has: (_t, prop) => Reflect.has((instance ??= createAuth()), prop),
});

export type Auth = typeof auth;
