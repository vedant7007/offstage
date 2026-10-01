import { SiteFooter } from "@/components/public/site-footer";
import { SiteHeader } from "@/components/public/site-header";
import { getT } from "@/lib/i18n/server";

/** Chrome for the public pages outside the landing film: event, register, verify, About our AI. */
export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const t = await getT();
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-(--z-toast) rounded-full bg-surface-raised px-4 py-3 font-medium focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {t("common.skipToContent")}
      </a>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
