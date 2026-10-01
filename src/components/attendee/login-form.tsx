"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { DemoPersona } from "@/contracts";
import { Alert, Button, Field, Input } from "@/components/ui";
import { cn } from "@/lib/utils";
import { DemoInboxLink } from "@/components/public/register/demo-inbox-link";
import { Turnstile } from "@/components/public/register/turnstile";
import { useLocale, useT } from "@/lib/i18n/provider";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Where each persona lands after a demo sign-in. */
const PERSONA_HOME: Record<DemoPersona, string> = {
  attendee: "/me",
  volunteer: "/crew",
  owner: "/console",
  program_lead: "/console",
  comms_lead: "/console",
  faculty: "/console",
  sponsor: "/console",
  viewer: "/console",
};
const PERSONAS = Object.keys(PERSONA_HOME) as DemoPersona[];
/** Display order: the event head leads as the primary pill. */
const SHOWN: DemoPersona[] = ["owner", ...PERSONAS.filter((p) => p !== "owner")];
/** Decorative role dot, one colour per persona. */
const DOT: Record<DemoPersona, string> = {
  owner: "bg-on-curtain",
  attendee: "bg-info",
  volunteer: "bg-approved",
  program_lead: "bg-agent",
  comms_lead: "bg-curtain",
  faculty: "bg-pending",
  sponsor: "bg-danger",
  viewer: "bg-neutral",
};
// The shared Button is rounded-control; `!` wins without depending on class order.
const PILL = "rounded-full!";
const LIFT =
  "transition-[color,background-color,border-color,box-shadow,translate]! duration-200 ease-[cubic-bezier(.4,0,.1,1)] motion-safe:hover:-translate-y-0.5 hover:shadow-md";

type Props = {
  next: string;
  demoMode: boolean;
  demoEventSlug: string;
  turnstileSiteKey: string | null;
};

async function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

export function LoginForm({ next, demoMode, demoEventSlug, turnstileSiteKey }: Props) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [code, setCode] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const [token, setToken] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<{ field?: "email" | "code"; text: string } | null>(null);
  const codeRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (sent) codeRef.current?.focus();
  }, [sent]);

  const sendCode = async () => {
    if (!EMAIL.test(email.trim())) {
      setError({ field: "email", text: t("login.invalidEmail") });
      return;
    }
    setBusy("send");
    setError(null);
    try {
      const res = await post(
        "/api/auth/email-otp/send-verification-otp",
        { email: email.trim(), type: "sign-in" },
        token ? { "x-turnstile-token": token } : {},
      );
      if (res.status === 429) setError({ text: t("login.rateLimited") });
      else if (!res.ok) setError({ text: t("login.error") });
      else setSent(true);
    } catch {
      setError({ text: t("login.error") });
    } finally {
      setBusy(null);
    }
  };

  const signIn = async () => {
    if (!/^\d{6}$/.test(code)) {
      setError({ field: "code", text: t("login.codeError") });
      return;
    }
    setBusy("signin");
    setError(null);
    try {
      const res = await post("/api/auth/sign-in/email-otp", { email: email.trim(), otp: code });
      if (res.ok) {
        router.replace(next);
        router.refresh();
        return;
      }
      setError({ field: "code", text: res.status === 429 ? t("login.rateLimited") : t("login.wrongCode") });
    } catch {
      setError({ text: t("login.error") });
    } finally {
      setBusy(null);
    }
  };

  const persona = async (p: DemoPersona) => {
    setBusy(p);
    setError(null);
    try {
      const res = await post("/api/demo/switch-persona", { persona: p, eventSlug: demoEventSlug });
      if (!res.ok) throw new Error(String(res.status));
      router.replace(p === "attendee" ? next : PERSONA_HOME[p]);
      router.refresh();
    } catch {
      setError({ text: t("login.error") });
      setBusy(null);
    }
  };

  const form = (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void (sent ? signIn() : sendCode());
      }}
      className="flex flex-col gap-5"
    >
      {error && !error.field ? <Alert variant="danger" title={error.text} /> : null}
      <Field label={t("login.email")} error={error?.field === "email" ? error.text : undefined} required>
        <Input
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          disabled={sent}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
        />
      </Field>
      {sent ? (
        <>
          <p aria-live="polite">{t("login.codeSent", { email: email.trim() })}</p>
          {demoMode ? <DemoInboxLink slug={demoEventSlug} email={email.trim()} sent={sent} /> : null}
          <Field label={t("login.code")} error={error?.field === "code" ? error.text : undefined} required>
            <Input
              ref={codeRef}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              className="max-w-48 font-mono text-xl tracking-[0.4em]"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                setError(null);
              }}
            />
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" size="lg" loading={busy === "signin"} className={PILL}>
              {t("login.signIn")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => void sendCode()}
              disabled={busy !== null}
              className={PILL}
            >
              {t("login.resend")}
            </Button>
            <Button
              type="button"
              variant="link"
              onClick={() => {
                setSent(false);
                setCode("");
              }}
            >
              {t("login.changeEmail")}
            </Button>
          </div>
        </>
      ) : (
        <>
          <Turnstile
            siteKey={turnstileSiteKey}
            label={t("login.botCheck")}
            language={locale === "hi" ? "hi" : "en"}
            onToken={setToken}
          />
          <Button type="submit" size="lg" loading={busy === "send"} className={cn(PILL, "w-full")}>
            {t("login.sendCode")}
          </Button>
        </>
      )}
    </form>
  );

  if (!demoMode) return form;

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="demo-title" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="demo-title" className="kicker text-fg-muted">
            {t("login.demoTitle")}
          </h2>
          <p className="text-sm text-fg-muted">{t("login.demoIntro")}</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {SHOWN.map((p) => {
            const lead = p === "owner";
            return (
              <Button
                key={p}
                type="button"
                variant={lead ? "primary" : "secondary"}
                size={lead ? "lg" : "md"}
                loading={busy === p}
                disabled={busy !== null && busy !== p}
                onClick={() => void persona(p)}
                className={cn(PILL, LIFT, lead ? "sm:col-span-2" : "justify-start! text-sm")}
              >
                {busy === p ? null : <span aria-hidden className={cn("size-2 rounded-full", DOT[p])} />}
                {t(`login.personas.${p}`)}
              </Button>
            );
          })}
        </div>
      </section>
      <div className="flex items-center gap-3">
        <span aria-hidden className="h-px flex-1 bg-border" />
        <p className="kicker text-fg-muted">or sign in with email</p>
        <span aria-hidden className="h-px flex-1 bg-border" />
      </div>
      {form}
    </div>
  );
}
