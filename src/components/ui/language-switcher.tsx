"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { ChevronDown, Languages } from "lucide-react";
import { useLocale, useT } from "@/lib/i18n/provider";
import { LOCALE_COOKIE, LOCALES, isLocale } from "@/lib/i18n/translate";

/**
 * Native select on purpose: it is the most reliable picker on phones and with screen readers.
 * The choice is stored in a cookie and the page re-renders on the server in the new language.
 */
function LanguageSwitcher({ className }: { className?: string }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const id = React.useId();

  return (
    <div className={cn("relative inline-flex items-center", className)}>
      <label htmlFor={id} className="sr-only">
        {t("language.label")}
      </label>
      <Languages aria-hidden className="pointer-events-none absolute left-3 size-4 text-fg-muted" />
      <select
        id={id}
        value={locale}
        disabled={pending}
        aria-busy={pending || undefined}
        onChange={(e) => {
          const next = e.target.value;
          if (!isLocale(next)) return;
          document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
          startTransition(() => router.refresh());
        }}
        className={cn(
          "min-h-11 appearance-none rounded-control border border-border-strong bg-surface py-2 pr-9 pl-9 text-sm text-fg",
          "hover:bg-surface-sunken disabled:opacity-55",
        )}
      >
        {LOCALES.map((l) => (
          <option key={l} value={l} lang={l === "hi" ? "hi" : l === "hinglish" ? "hi-Latn" : "en"}>
            {t(`language.${l}`)}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-3 size-4 text-fg-muted" />
    </div>
  );
}

export { LanguageSwitcher };
