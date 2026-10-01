"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { DemoPersona } from "@/contracts";
import { Alert, Button, Field, Input } from "@/components/ui";
import { ArrowRight, LayoutDashboard, LoaderCircle, ScanLine, Ticket, type LucideIcon } from "lucide-react";
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
/**
 * The three doors a judge needs first, each with where it leads. The event head is the lead card.
 * ponytail: hints are English until en.json gains login.personaHints.*; lang="en" marks them.
 */
const DOORS: { p: DemoPersona; icon: LucideIcon; hint: string }[] = [
  { p: "owner", icon: LayoutDashboard, hint: "The console. Approve what the agents propose." },
  { p: "attendee", icon: Ticket, hint: "Ticket, schedule and answers with sources" },
  { p: "volunteer", icon: ScanLine, hint: "Gate check-in and tasks on the phone" },
];
/** Every other persona opens the console with a narrower role. */
const MORE = PERSONAS.filter((p) => !DOORS.some((d) => d.p === p));
/** Decorative role dot for the compact console roles. */
const DOT: Partial<Record<DemoPersona, string>> = {
  program_lead: "bg-agent",
  comms_lead: "bg-info",
  faculty: "bg-pending",
  sponsor: "bg-danger",
  viewer: "bg-neutral",
};

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
          <p aria-live="polite" className="rounded-control bg-surface-sunken px-4 py-3 text-sm">
            {t("login.codeSent", { email: email.trim() })}
          </p>
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
          <div className="flex flex-col gap-2">
            <Button type="submit" size="lg" loading={busy === "signin"} block>
              {t("login.signIn")}
            </Button>
            <div className="flex flex-wrap items-center justify-between gap-x-4">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void sendCode()}
                disabled={busy !== null}
              >
                {t("login.resend")}
              </Button>
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={() => {
                  setSent(false);
                  setCode("");
                }}
              >
                {t("login.changeEmail")}
              </Button>
            </div>
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
          <Button type="submit" size="lg" loading={busy === "send"} block>
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
        <div className="grid gap-2">
          {DOORS.map(({ p, icon: Icon, hint }) => {
            const lead = p === "owner";
            const label = t(`login.personas.${p}`);
            return (
              <Button
                key={p}
                type="button"
                variant={lead ? "primary" : "secondary"}
                aria-label={label}
                aria-describedby={`persona-${p}-hint`}
                aria-busy={busy === p || undefined}
                disabled={busy !== null}
                onClick={() => void persona(p)}
                className={cn(
                  "group h-auto justify-start gap-3 rounded-card! px-4 py-3 text-left whitespace-normal",
                  lead && "py-4",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-full",
                    lead ? "bg-on-curtain/15" : "bg-fg/8 group-hover:bg-bg/15",
                  )}
                >
                  {busy === p ? <LoaderCircle className="animate-spin" /> : <Icon />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-medium">
                    {label}
                    {lead ? (
                      <span
                        lang="en"
                        className="rounded-full border border-current/40 px-2 py-0.5 font-mono text-[0.6875rem] tracking-[0.12em] uppercase"
                      >
                        Start here
                      </span>
                    ) : null}
                  </span>
                  <span id={`persona-${p}-hint`} lang="en" className="text-sm font-normal opacity-80">
                    {hint}
                  </span>
                </span>
                <ArrowRight
                  aria-hidden
                  className="motion-safe:transition-transform motion-safe:duration-200 motion-safe:group-hover:translate-x-0.5"
                />
              </Button>
            );
          })}
        </div>
        <div className="flex flex-col gap-2 pt-1">
          <p lang="en" className="text-sm text-fg-muted">
            More console roles
          </p>
          <div className="flex flex-wrap gap-2">
            {MORE.map((p) => (
              <Button
                key={p}
                type="button"
                variant="secondary"
                size="sm"
                loading={busy === p}
                disabled={busy !== null && busy !== p}
                onClick={() => void persona(p)}
              >
                {busy === p ? null : <span aria-hidden className={cn("size-2 rounded-full", DOT[p])} />}
                {t(`login.personas.${p}`)}
              </Button>
            ))}
          </div>
        </div>
      </section>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <span aria-hidden className="h-px flex-1 bg-border" />
          <p lang="en" className="kicker text-fg-muted">
            or sign in with email
          </p>
          <span aria-hidden className="h-px flex-1 bg-border" />
        </div>
        <p className="text-center text-sm text-fg-muted">{t("login.intro")}</p>
      </div>
      {form}
    </div>
  );
}
