import type { Metadata, Viewport } from "next";
import { Eczar, Noto_Sans, Noto_Sans_Devanagari } from "next/font/google";
import { Providers } from "@/components/ui/providers";
import { getLocale } from "@/lib/i18n/server";
import { getMessages } from "@/lib/i18n/messages";
import { HTML_LANG } from "@/lib/i18n/translate";
import "./globals.css";

const notoSans = Noto_Sans({ subsets: ["latin"], variable: "--font-noto-sans", display: "swap" });

// Loaded without preload: the browser fetches it only when Devanagari text appears.
const notoDevanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  variable: "--font-noto-devanagari",
  display: "swap",
  preload: false,
});

// Display face for public page headings only.
const eczar = Eczar({ subsets: ["latin"], variable: "--font-eczar", display: "swap", preload: false });

export const metadata: Metadata = {
  title: { default: "OFFSTAGE", template: "%s | OFFSTAGE" },
  description:
    "Tell OFFSTAGE about your event. It builds the team, runs the show, and asks you only when it matters.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf6ef" },
    { media: "(prefers-color-scheme: dark)", color: "#111318" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  return (
    <html
      lang={HTML_LANG[locale]}
      suppressHydrationWarning
      className={`${notoSans.variable} ${notoDevanagari.variable} ${eczar.variable} antialiased`}
    >
      <body>
        <Providers locale={locale} messages={getMessages(locale)}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
