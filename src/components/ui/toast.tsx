"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";
import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert } from "lucide-react";
import { useT } from "@/lib/i18n/provider";

/**
 * Mount once in the root providers. Call toast.success("..."), toast.info("...") anywhere.
 * Toasts sit at the top so they never cover the mobile bottom tab bar.
 * Use toasts for confirmations only. Anything the person must act on belongs in an Alert.
 */
function Toaster() {
  const { resolvedTheme } = useTheme();
  const t = useT();
  return (
    <Sonner
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      position="top-center"
      closeButton
      containerAriaLabel={t("alert.info")}
      visibleToasts={3}
      gap={8}
      icons={{
        success: <CircleCheck aria-hidden className="size-5 text-approved" />,
        info: <Info aria-hidden className="size-5 text-info" />,
        warning: <TriangleAlert aria-hidden className="size-5 text-pending" />,
        error: <CircleAlert aria-hidden className="size-5 text-danger" />,
        loading: <LoaderCircle aria-hidden className="size-5 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--surface-raised)",
          "--normal-text": "var(--fg)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius-card)",
          zIndex: "var(--z-toast)",
        } as React.CSSProperties
      }
      toastOptions={{
        closeButtonAriaLabel: t("common.close"),
        classNames: { toast: "font-sans text-base depth-3", description: "text-fg-muted" },
      }}
    />
  );
}

export { Toaster, toast };
