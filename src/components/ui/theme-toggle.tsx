"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { IconButton } from "./button";

const subscribe = () => () => {};

/** Switches between the paper (light) and ink (dark) themes. Starts from the device setting. */
function ThemeToggle({ className }: { className?: string }) {
  const t = useT();
  const { resolvedTheme, setTheme } = useTheme();
  // The theme is only known in the browser; render a stable placeholder on the server.
  const mounted = React.useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const dark = mounted && resolvedTheme === "dark";
  return (
    <IconButton
      className={className}
      label={dark ? t("theme.toLight") : t("theme.toDark")}
      icon={dark ? <Sun aria-hidden /> : <Moon aria-hidden />}
      onClick={() => setTheme(dark ? "light" : "dark")}
    />
  );
}

export { ThemeToggle };
