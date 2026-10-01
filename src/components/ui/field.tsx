"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";

type FieldContextValue = {
  id: string;
  hintId?: string;
  errorId?: string;
  invalid: boolean;
  required: boolean;
};

const FieldContext = React.createContext<FieldContextValue | null>(null);

/** Props a control needs to be wired to its Field: id, described-by, invalid and required. */
export function useFieldControl(props: { id?: string; "aria-describedby"?: string; required?: boolean }) {
  const field = React.useContext(FieldContext);
  if (!field) return {};
  const describedBy = [props["aria-describedby"], field.hintId, field.errorId].filter(Boolean).join(" ");
  return {
    id: props.id ?? field.id,
    "aria-describedby": describedBy || undefined,
    "aria-invalid": field.invalid || undefined,
    required: props.required ?? (field.required || undefined),
  };
}

type FieldProps = {
  label: React.ReactNode;
  hint?: React.ReactNode;
  /** When set, the control is marked invalid and this text is announced with it. */
  error?: React.ReactNode;
  required?: boolean;
  /** Hide the label visually but keep it for screen readers. Use sparingly. */
  hideLabel?: boolean;
  className?: string;
  children: React.ReactNode;
};

/** Label, hint and error around one control, with ids wired for screen readers. */
export function Field({ label, hint, error, required = false, hideLabel, className, children }: FieldProps) {
  const t = useT();
  const id = React.useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <FieldContext.Provider value={{ id, hintId, errorId, invalid: Boolean(error), required }}>
      <div data-slot="field" className={cn("flex flex-col gap-1.5", className)}>
        <label
          htmlFor={id}
          className={cn("text-sm font-medium tracking-[-0.01em] text-fg", hideLabel && "sr-only")}
        >
          {label}
          {required ? (
            <span className="ml-1 text-fg-muted" aria-hidden>
              *
            </span>
          ) : null}
          {required ? <span className="sr-only"> ({t("common.required")})</span> : null}
        </label>
        {hint ? (
          <p id={hintId} className="text-sm text-fg-muted">
            {hint}
          </p>
        ) : null}
        {children}
        {error ? (
          <p id={errorId} className="text-sm font-medium text-danger-text">
            {error}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}

/** Shared look for text-like controls. */
export const controlClass = cn(
  "w-full rounded-control border-[1.5px] border-border-strong bg-surface-raised px-3 text-base text-fg depth-1",
  "placeholder:text-fg-muted transition-[border-color,background-color] duration-(--duration-fast) ease-out",
  "hover:border-fg disabled:cursor-not-allowed disabled:opacity-55",
  // Focus: the 2px ring plus a soft halo in the ring colour (the halo is static, never animated)
  "focus-visible:border-ring focus-visible:outline-offset-1 focus-visible:shadow-[0_0_0_4px_color-mix(in_srgb,var(--ring)_16%,transparent)]",
  "aria-invalid:border-2 aria-invalid:border-danger",
);
