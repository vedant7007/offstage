"use client";

import * as React from "react";
import { ThemeProvider } from "next-themes";
import { I18nProvider } from "@/lib/i18n/provider";
import type { Locale, Messages } from "@/lib/i18n/translate";
import { Toaster } from "./toast";
import { TooltipProvider } from "./tooltip";

/** Everything client-side the whole app needs. Mounted once in the root layout. */
function Providers({ locale, messages, children }: { locale: Locale; messages: Messages; children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <I18nProvider locale={locale} messages={messages}>
        <TooltipProvider delayDuration={300}>
          {children}
          <Toaster />
        </TooltipProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}

export { Providers };
