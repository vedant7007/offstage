"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarPlus, CircleCheck, Clock, MessageCircleQuestionMark, Ticket } from "lucide-react";
import type { FoodPref, PublicRegisterResponse } from "@/contracts";
import {
  Alert,
  Button,
  Checkbox,
  Field,
  Input,
  RadioGroup,
  RadioGroupItem,
  Select,
  Stepper,
  Textarea,
  TimeRange,
} from "@/components/ui";
import { ApiClientError, createApiClient } from "@/lib/api-client";
import { CONSENT_VERSION } from "@/lib/i18n/consent";
import { useLocale, useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { buildIcs, downloadIcs } from "./ics";
import { DemoInboxLink } from "./demo-inbox-link";
import { Turnstile } from "./turnstile";

export type ChoosableSession = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  roomName?: string;
  capacity: number;
  registeredCount: number;
};

export type RegisterEvent = {
  slug: string;
  name: string;
  startsAt: string;
  endsAt: string;
  venue: string;
};

type Props = {
  event: RegisterEvent;
  sessions: ChoosableSession[];
  turnstileSiteKey: string | null;
};

type Form = {
  name: string;
  email: string;
  phone: string;
  college: string;
  department: string;
  year: string;
  section: string;
  rollNo: string;
  sessionChoices: string[];
  foodPref: FoodPref | "";
  accessibility: string;
  age: "adult" | "guardian" | "";
  consent: boolean;
};

type FieldName = keyof Form | "turnstile" | "code";
type Errors = Partial<Record<FieldName, string>>;

const STEPS = ["details", "choices", "consent", "verify"] as const;
type Step = (typeof STEPS)[number];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9 -]{10,16}$/;
const FOODS: FoodPref[] = ["veg", "non_veg", "vegan", "jain", "none"];
const FOOD_KEY = {
  veg: "register.foodVeg",
  non_veg: "register.foodNonVeg",
  vegan: "register.foodVegan",
  jain: "register.foodJain",
  none: "register.foodNone",
} as const;

const empty: Form = {
  name: "",
  email: "",
  phone: "",
  college: "",
  department: "",
  year: "",
  section: "",
  rollNo: "",
  sessionChoices: [],
  foodPref: "",
  accessibility: "",
  age: "",
  consent: false,
};

/**
 * Four steps: details, session choices, preferences and consent, then email verification.
 * The code is sent when the last step opens; verifying it also submits the registration.
 */
export function RegisterFlow({ event, sessions, turnstileSiteKey }: Props) {
  const t = useT();
  const locale = useLocale();
  const api = React.useMemo(() => createApiClient(), []);
  const [step, setStep] = React.useState<Step>("details");
  const [form, setForm] = React.useState<Form>(empty);
  const [errors, setErrors] = React.useState<Errors>({});
  const [turnstileToken, setTurnstileToken] = React.useState<string | null>(null);
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState<"sending" | "verifying" | null>(null);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [resendAt, setResendAt] = React.useState(0);
  const [now, setNow] = React.useState(() => Date.now());
  const [result, setResult] = React.useState<PublicRegisterResponse | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const moved = React.useRef(false);

  const index = STEPS.indexOf(step);
  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  // Countdown for the resend button.
  React.useEffect(() => {
    if (resendAt <= now) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [resendAt, now]);
  const waitSeconds = Math.max(0, Math.ceil((resendAt - now) / 1000));

  // After a step change, move focus to the new step's heading so screen readers announce it.
  React.useEffect(() => {
    if (moved.current) headingRef.current?.focus();
    moved.current = true;
  }, [step, result]);

  // After a failed submit, move focus to the first field that needs attention.
  const focusFirstError = () =>
    requestAnimationFrame(() => {
      const el = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      if (!el) return;
      const target = el.getAttribute("role") === "radiogroup" ? el.querySelector<HTMLElement>("button") : el;
      target?.focus();
    });

  const validate = (s: Step): Errors => {
    const e: Errors = {};
    if (s === "details") {
      if (form.name.trim().length < 2) e.name = t("register.required");
      if (!EMAIL.test(form.email.trim())) e.email = t("register.invalidEmail");
      if (form.phone.trim() && !PHONE.test(form.phone.trim())) e.phone = t("register.invalidPhone");
      if (form.college.trim().length < 2) e.college = t("register.required");
      if (!form.department.trim()) e.department = t("register.required");
      if (!form.year) e.year = t("register.required");
      if (!form.section.trim()) e.section = t("register.required");
    }
    if (s === "consent") {
      if (!form.foodPref) e.foodPref = t("register.required");
      if (!form.age) e.age = t("register.ageError");
      if (!form.consent) e.consent = t("register.consentError");
      if (turnstileSiteKey && !turnstileToken) e.turnstile = t("register.required");
    }
    if (s === "verify" && !/^\d{6}$/.test(code)) e.code = t("register.codeError");
    return e;
  };

  const explain = (err: unknown) => {
    if (err instanceof ApiClientError && err.code === "rate_limited") {
      const seconds = err.retryAfterSeconds ?? 60;
      setResendAt(Date.now() + seconds * 1000);
      setNow(Date.now());
      return t("register.errorRateLimited", { seconds });
    }
    return t("register.errorGeneric");
  };

  const sendCode = async () => {
    setBusy("sending");
    setProblem(null);
    try {
      const res = await api.otpRequest(event.slug, {
        email: form.email.trim(),
        turnstileToken: turnstileToken ?? undefined,
      });
      setResendAt(Date.now() + res.resendAfterSeconds * 1000);
      setNow(Date.now());
    } catch (err) {
      setProblem(explain(err));
    } finally {
      setBusy(null);
    }
  };

  const next = async () => {
    const e = validate(step);
    setErrors(e);
    if (Object.values(e).some(Boolean)) {
      focusFirstError();
      return;
    }
    const following = STEPS[index + 1];
    if (!following) return;
    setStep(following);
    if (following === "verify") await sendCode();
  };

  const verify = async () => {
    const e = validate("verify");
    setErrors(e);
    if (e.code) {
      focusFirstError();
      return;
    }
    setBusy("verifying");
    setProblem(null);
    try {
      const email = form.email.trim();
      const { verificationToken } = await api.otpVerify(event.slug, { email, code });
      const res = await api.register(event.slug, {
        verificationToken,
        turnstileToken: turnstileToken ?? undefined,
        name: form.name.trim(),
        email,
        phone: form.phone.trim() || undefined,
        college: form.college.trim(),
        department: form.department.trim(),
        year: Number(form.year),
        section: form.section.trim(),
        rollNo: form.rollNo.trim() || undefined,
        sessionChoices: form.sessionChoices,
        foodPref: form.foodPref as FoodPref,
        accessibility: form.accessibility.trim() || undefined,
        adultConfirmed: form.age === "adult",
        guardianConsent: form.age === "guardian",
        consentVersion: CONSENT_VERSION,
      });
      setResult(res);
    } catch (err) {
      setProblem(explain(err));
    } finally {
      setBusy(null);
    }
  };

  const back = () => {
    const previous = STEPS[index - 1];
    if (previous) {
      setProblem(null);
      setStep(previous);
    }
  };

  if (result) return <Done event={event} result={result} name={form.name.trim()} headingRef={headingRef} />;

  const stepTitle = {
    details: t("register.stepDetails"),
    choices: t("register.stepChoices"),
    consent: t("register.stepConsent"),
    verify: t("register.stepVerify"),
  }[step];
  const hasErrors = Object.values(errors).some(Boolean);

  return (
    <div className="flex flex-col gap-6">
      <Stepper
        steps={[
          t("register.stepDetails"),
          t("register.stepChoices"),
          t("register.stepConsent"),
          t("register.stepVerify"),
        ]}
        current={index}
      />

      <form
        ref={formRef}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void (step === "verify" ? verify() : next());
        }}
        className="flex flex-col gap-5"
      >
        <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold outline-none">
          {stepTitle}
        </h2>

        {hasErrors ? <Alert variant="danger" title={t("register.fixErrors")} /> : null}
        {problem ? <Alert variant="danger" title={problem} /> : null}

        {step === "details" ? (
          <>
            <Field label={t("register.name")} hint={t("register.nameHint")} error={errors.name} required>
              <Input
                name="name"
                autoComplete="name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </Field>
            <Field label={t("register.email")} hint={t("register.emailHint")} error={errors.email} required>
              <Input
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </Field>
            <Field label={t("register.phone")} hint={t("register.phoneHint")} error={errors.phone}>
              <Input
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
            </Field>
            <Field label={t("register.college")} error={errors.college} required>
              <Input
                name="college"
                autoComplete="organization"
                value={form.college}
                onChange={(e) => set("college", e.target.value)}
              />
            </Field>
            <Field label={t("register.department")} error={errors.department} required>
              <Input
                name="department"
                value={form.department}
                onChange={(e) => set("department", e.target.value)}
              />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={t("register.year")} error={errors.year} required>
                <Select
                  value={form.year}
                  onValueChange={(v) => set("year", v)}
                  options={[1, 2, 3, 4, 5, 6].map((y) => ({
                    value: String(y),
                    label: t("register.yearOption", { year: y }),
                  }))}
                />
              </Field>
              <Field label={t("register.section")} error={errors.section} required>
                <Input name="section" value={form.section} onChange={(e) => set("section", e.target.value)} />
              </Field>
            </div>
            <Field label={t("register.rollNo")} hint={t("register.rollNoHint")} error={errors.rollNo}>
              <Input name="rollNo" value={form.rollNo} onChange={(e) => set("rollNo", e.target.value)} />
            </Field>
          </>
        ) : null}

        {step === "choices" ? (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-base text-fg-muted">{t("register.choicesIntro")}</legend>
            {sessions.length === 0 ? <p>{t("register.choicesNone")}</p> : null}
            {sessions.map((s) => {
              const left = Math.max(s.capacity - s.registeredCount, 0);
              const checked = form.sessionChoices.includes(s.id);
              return (
                <div
                  key={s.id}
                  className={cn(
                    "rounded-card border px-4 py-1",
                    checked ? "border-curtain bg-curtain-soft/40" : "border-border bg-surface",
                  )}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) =>
                      set(
                        "sessionChoices",
                        v === true
                          ? [...form.sessionChoices, s.id]
                          : form.sessionChoices.filter((id) => id !== s.id),
                      )
                    }
                    label={<span className="font-medium">{s.title}</span>}
                    description={
                      <span className="flex flex-col gap-0.5">
                        <span>
                          <TimeRange start={s.startsAt} end={s.endsAt} withDate />
                          {s.roomName ? `, ${s.roomName}` : ""}
                        </span>
                        <span className={left === 0 ? "font-medium text-pending-text" : undefined}>
                          {left === 0 ? t("register.waitlistHint") : t("register.seatsLeft", { count: left })}
                        </span>
                      </span>
                    }
                  />
                </div>
              );
            })}
          </fieldset>
        ) : null}

        {step === "consent" ? (
          <>
            <RadioGroup
              legend={t("register.food")}
              value={form.foodPref}
              onValueChange={(v) => set("foodPref", v as FoodPref)}
              aria-invalid={errors.foodPref ? true : undefined}
              aria-describedby={errors.foodPref ? "food-error" : undefined}
            >
              {FOODS.map((f) => (
                <RadioGroupItem key={f} value={f} label={t(FOOD_KEY[f])} />
              ))}
            </RadioGroup>
            {errors.foodPref ? (
              <p id="food-error" className="-mt-3 text-sm font-medium text-danger-text">
                {errors.foodPref}
              </p>
            ) : null}

            <Field label={t("register.accessibility")} hint={t("register.accessibilityHint")}>
              <Textarea
                name="accessibility"
                maxLength={400}
                value={form.accessibility}
                onChange={(e) => set("accessibility", e.target.value)}
              />
            </Field>

            <RadioGroup
              legend={t("register.age")}
              value={form.age}
              onValueChange={(v) => set("age", v as Form["age"])}
              aria-invalid={errors.age ? true : undefined}
              aria-describedby={errors.age ? "age-error" : undefined}
            >
              <RadioGroupItem value="adult" label={t("register.adult")} />
              <RadioGroupItem value="guardian" label={t("register.guardian")} />
            </RadioGroup>
            {errors.age ? (
              <p id="age-error" className="-mt-3 text-sm font-medium text-danger-text">
                {errors.age}
              </p>
            ) : null}

            <section
              aria-labelledby="consent-title"
              className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4"
            >
              <h3 id="consent-title" className="font-semibold">
                {t("register.consentTitle")}
              </h3>
              <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed">
                <li>{t("register.consentPurposes")}</li>
                <li>{t("register.consentRetention")}</li>
                <li>{t("register.consentSecurity")}</li>
                <li>{t("register.consentRights")}</li>
              </ul>
              <p className="text-xs text-fg-muted">
                {t("register.consentVersion", { version: CONSENT_VERSION })}
              </p>
            </section>
            <Checkbox
              checked={form.consent}
              onCheckedChange={(v) => set("consent", v === true)}
              label={t("register.consentAgree")}
              aria-invalid={errors.consent ? true : undefined}
              aria-describedby={errors.consent ? "consent-error" : undefined}
            />
            {errors.consent ? (
              <p id="consent-error" className="-mt-3 text-sm font-medium text-danger-text">
                {errors.consent}
              </p>
            ) : null}

            <Turnstile
              siteKey={turnstileSiteKey}
              label={t("register.botCheck")}
              language={locale === "hi" ? "hi" : "en"}
              onToken={(token) => {
                setTurnstileToken(token);
                setErrors((e) => ({ ...e, turnstile: undefined }));
              }}
            />
            {errors.turnstile ? (
              <p className="-mt-3 text-sm font-medium text-danger-text">{errors.turnstile}</p>
            ) : null}
          </>
        ) : null}

        {step === "verify" ? (
          <>
            <p aria-live="polite">
              {busy === "sending"
                ? t("register.sending")
                : t("register.verifyIntro", { email: form.email.trim() })}
            </p>
            <DemoInboxLink slug={event.slug} email={form.email.trim()} sent={busy !== "sending"} />
            <Field label={t("register.code")} error={errors.code} required>
              <Input
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                className="max-w-48 font-mono text-xl tracking-[0.4em]"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                  setErrors((er) => ({ ...er, code: undefined }));
                }}
              />
            </Field>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={waitSeconds > 0 || busy !== null}
                onClick={() => void sendCode()}
              >
                {t("register.resend")}
              </Button>
              {waitSeconds > 0 ? (
                <p className="text-sm text-fg-muted" aria-live="polite">
                  {t("register.resendIn", { seconds: waitSeconds })}
                </p>
              ) : null}
              <Button type="button" variant="link" size="sm" onClick={() => setStep("details")}>
                {t("register.changeEmail")}
              </Button>
            </div>
          </>
        ) : null}

        <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-between">
          {index > 0 ? (
            <Button type="button" variant="secondary" onClick={back} disabled={busy !== null}>
              {t("register.back")}
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" loading={busy !== null}>
            {step === "verify" ? t("register.verify") : t("register.next")}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Done({
  event,
  result,
  name,
  headingRef,
}: {
  event: RegisterEvent;
  result: PublicRegisterResponse;
  name: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const t = useT();
  const waitlisted = result.status === "waitlisted";
  const addToCalendar = () =>
    downloadIcs(
      `${event.slug}.ics`,
      buildIcs({
        uid: `${result.registrationId}@offstage`,
        title: event.name,
        start: event.startsAt,
        end: event.endsAt,
        location: event.venue,
        url: `${window.location.origin}/e/${event.slug}`,
      }),
    );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3">
        {waitlisted ? (
          <Clock aria-hidden className="mt-1 size-7 shrink-0 text-pending" />
        ) : (
          <CircleCheck aria-hidden className="mt-1 size-7 shrink-0 text-approved" />
        )}
        <div className="flex flex-col gap-1">
          <h2 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold outline-none">
            {waitlisted ? t("register.doneWaitlistTitle") : t("register.doneTitle")}
          </h2>
          {waitlisted && result.waitlistPosition ? (
            <p>{t("register.doneWaitlist", { position: result.waitlistPosition })}</p>
          ) : null}
        </div>
      </div>

      {result.duplicateSuspected ? <Alert variant="info" title={t("register.doneDuplicate")} /> : null}

      {result.ticket ? (
        <section
          aria-labelledby="ticket-title"
          className="flex flex-col items-center gap-3 rounded-card border border-border bg-surface p-5 text-center"
        >
          <h3 id="ticket-title" className="flex items-center gap-2 text-lg font-semibold">
            <Ticket aria-hidden className="size-5" />
            {t("register.ticketTitle")}
          </h3>
          {/* The QR must stay dark on white for scanners, whatever the theme. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={result.ticket.qrPngDataUrl}
            alt={t("register.ticketFor", { name })}
            width={240}
            height={240}
            className="rounded-control bg-white p-3"
          />
          <p className="max-w-sm text-sm text-fg-muted">{t("register.ticketHint")}</p>
        </section>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Button type="button" variant="secondary" onClick={addToCalendar}>
          <CalendarPlus aria-hidden />
          {t("register.addToCalendar")}
        </Button>
        <Button asChild>
          <Link href="/me">{t("register.openPortal")}</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/me/chat">
            <MessageCircleQuestionMark aria-hidden />
            {t("register.askHelpdesk")}
          </Link>
        </Button>
      </div>
    </div>
  );
}
