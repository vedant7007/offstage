"use client";

import * as React from "react";
import { CircleCheck } from "lucide-react";
import { Alert, Button, Checkbox, Field, Textarea } from "@/components/ui";
import { ApiClientError, createApiClient } from "@/lib/api-client";
import { useT } from "@/lib/i18n/provider";

const AV = [
  "projector_hdmi",
  "usb_c_adapter",
  "clicker",
  "lapel_mic",
  "handheld_mic",
  "video_sound",
  "internet",
  "whiteboard",
  "power_strip",
] as const;
type AvKey = (typeof AV)[number];

type Props = { slug: string; token: string };

/** Speaker requirements, reached through a token link. No login; sending again updates the answers. */
export function SpeakerForm({ slug, token }: Props) {
  const t = useT();
  const api = React.useMemo(() => createApiClient(), []);
  const [av, setAv] = React.useState<AvKey[]>([]);
  const [travel, setTravel] = React.useState("");
  const [stay, setStay] = React.useState("");
  const [materials, setMaterials] = React.useState("");
  const [bio, setBio] = React.useState("");
  const [bioConfirmed, setBioConfirmed] = React.useState(false);
  const [bioError, setBioError] = React.useState(false);
  const [state, setState] = React.useState<"idle" | "sending" | "sent" | "error" | "badLink">("idle");
  const doneRef = React.useRef<HTMLHeadingElement>(null);

  React.useEffect(() => {
    if (state === "sent") doneRef.current?.focus();
  }, [state]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bioConfirmed) {
      setBioError(true);
      document.getElementById("bio-confirm")?.focus();
      return;
    }
    setState("sending");
    try {
      await api.speakerForm(slug, token, {
        av,
        travel: travel.trim() || undefined,
        stay: stay.trim() || undefined,
        materials: materials.trim() || undefined,
        bio: bio.trim() || undefined,
        bioConfirmed,
      });
      setState("sent");
    } catch (err) {
      const bad =
        err instanceof ApiClientError && (err.status === 404 || err.status === 403 || err.status === 410);
      setState(bad ? "badLink" : "error");
    }
  };

  if (state === "sent") {
    return (
      <div className="flex items-start gap-3 rounded-card border-2 border-approved bg-approved-soft p-5 text-approved-soft-fg">
        <CircleCheck aria-hidden className="mt-0.5 size-7 shrink-0" />
        <div className="flex flex-col gap-1">
          <h2 ref={doneRef} tabIndex={-1} className="text-xl font-semibold outline-none">
            {t("speakerForm.sent")}
          </h2>
          <p>{t("speakerForm.sentBody")}</p>
        </div>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-6">
      {state === "error" ? <Alert variant="danger" title={t("speakerForm.error")} /> : null}
      {state === "badLink" ? <Alert variant="warning" title={t("speakerForm.badLink")} /> : null}

      <fieldset className="flex flex-col gap-1 rounded-card border border-border bg-surface p-4">
        <legend className="px-1 text-base font-semibold">{t("speakerForm.avTitle")}</legend>
        <p className="mb-1 text-sm text-fg-muted">{t("speakerForm.avHint")}</p>
        <div className="grid sm:grid-cols-2 sm:gap-x-4">
          {AV.map((key) => (
            <Checkbox
              key={key}
              checked={av.includes(key)}
              onCheckedChange={(v) =>
                setAv((cur) => (v === true ? [...cur, key] : cur.filter((k) => k !== key)))
              }
              label={t(`speakerForm.av.${key}`)}
            />
          ))}
        </div>
      </fieldset>

      <Field label={t("speakerForm.travel")} hint={t("speakerForm.travelHint")}>
        <Textarea rows={3} maxLength={600} value={travel} onChange={(e) => setTravel(e.target.value)} />
      </Field>
      <Field label={t("speakerForm.stay")} hint={t("speakerForm.stayHint")}>
        <Textarea rows={2} maxLength={600} value={stay} onChange={(e) => setStay(e.target.value)} />
      </Field>
      <Field label={t("speakerForm.materials")} hint={t("speakerForm.materialsHint")}>
        <Textarea rows={2} maxLength={600} value={materials} onChange={(e) => setMaterials(e.target.value)} />
      </Field>
      <Field label={t("speakerForm.bio")} hint={t("speakerForm.bioHint")}>
        <Textarea rows={5} maxLength={2000} value={bio} onChange={(e) => setBio(e.target.value)} />
      </Field>
      <div className="flex flex-col gap-1">
        <Checkbox
          id="bio-confirm"
          checked={bioConfirmed}
          onCheckedChange={(v) => {
            setBioConfirmed(v === true);
            setBioError(false);
          }}
          label={t("speakerForm.bioConfirm")}
          aria-invalid={bioError || undefined}
          aria-describedby={bioError ? "bio-error" : undefined}
        />
        {bioError ? (
          <p id="bio-error" className="text-sm font-medium text-danger-text">
            {t("speakerForm.bioError")}
          </p>
        ) : null}
      </div>

      <div className="border-t border-border pt-5">
        <Button type="submit" size="lg" loading={state === "sending"} className="w-full sm:w-auto">
          {t("speakerForm.submit")}
        </Button>
      </div>
    </form>
  );
}
