"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { CircleAlert, Info, Siren, TriangleAlert, X } from "lucide-react";
import { useT } from "@/lib/i18n/provider";

const VARIANTS = {
  info: { icon: Info, box: "border-info bg-info-soft text-info-soft-fg", role: "status" },
  warning: {
    icon: TriangleAlert,
    box: "border-pending bg-pending-soft text-pending-soft-fg",
    role: "status",
  },
  danger: { icon: CircleAlert, box: "border-danger bg-danger-soft text-danger-soft-fg", role: "alert" },
  // Emergency is the only solid red, and it carries a stripe pattern and a heavier frame
  // so it reads as different from danger even without colour.
  emergency: {
    icon: Siren,
    box: "border-emergency bg-emergency text-on-emergency border-4 border-double",
    role: "alert",
  },
} as const;

export type AlertVariant = keyof typeof VARIANTS;

type AlertProps = Omit<React.ComponentProps<"div">, "title"> & {
  variant?: AlertVariant;
  title: React.ReactNode;
  onDismiss?: () => void;
  action?: React.ReactNode;
};

function Alert({ variant = "info", title, onDismiss, action, className, children, ...props }: AlertProps) {
  const t = useT();
  const { icon: Icon, box, role } = VARIANTS[variant];
  const emergency = variant === "emergency";
  return (
    <div
      data-slot="alert"
      data-variant={variant}
      role={role}
      className={cn(
        "relative flex gap-3 overflow-hidden rounded-control border border-l-4 p-4",
        box,
        className,
      )}
      {...props}
    >
      {emergency ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(-45deg,transparent_0_10px,rgb(0_0_0/0.16)_10px_20px)]"
        />
      ) : null}
      <Icon aria-hidden className={cn("relative mt-0.5 shrink-0", emergency ? "size-6" : "size-5")} />
      <div className="relative flex min-w-0 flex-1 flex-col gap-1">
        <p className={cn("font-semibold", emergency ? "text-lg uppercase tracking-wide" : "text-base")}>
          <span className="sr-only">{t(`alert.${variant}`)}: </span>
          {title}
        </p>
        {children ? <div className="text-sm">{children}</div> : null}
        {action ? <div className="mt-2 flex flex-wrap gap-2">{action}</div> : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t("alert.dismiss")}
          className="relative -m-2 flex size-11 shrink-0 items-center justify-center rounded-control hover:bg-black/10"
        >
          <X aria-hidden className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

export { Alert };
