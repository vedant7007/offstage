import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Inter_Tight, Noto_Sans_Devanagari } from "next/font/google";
import { Providers } from "@/components/ui/providers";
import { getLocale } from "@/lib/i18n/server";
import { getMessages } from "@/lib/i18n/messages";
import { HTML_LANG } from "@/lib/i18n/translate";
import { isShowcase } from "@/showcase/flag";
import { NetworkGuard } from "@/showcase/guard/network-guard";
import { ShowcaseBanner } from "@/showcase/banner/showcase-banner";
import "./globals.css";

// Inter Tight for every heading and paragraph, IBM Plex Mono for kickers, labels and numbers.
const grotesk = Inter_Tight({ subsets: ["latin", "latin-ext"], variable: "--font-grotesk", display: "swap" });
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

// Loaded without preload: the browser fetches it only when Devanagari text appears.
const notoDevanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  variable: "--font-noto-devanagari",
  display: "swap",
  preload: false,
});

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
    { media: "(prefers-color-scheme: light)", color: "#E4E6EF" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  return (
    <html
      lang={HTML_LANG[locale]}
      suppressHydrationWarning
      className={`${grotesk.variable} ${plexMono.variable} ${notoDevanagari.variable} antialiased`}
    >
      <body>
        {isShowcase() && <NetworkGuard />}
        <Providers locale={locale} messages={getMessages(locale)}>
          {isShowcase() && <ShowcaseBanner />}
          {children}
        </Providers>
      </body>
    </html>
  );
}
