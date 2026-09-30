import Link from "next/link";
import { getT } from "@/lib/i18n/server";

export async function SiteFooter() {
  const t = await getT();
  return (
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-fg-muted md:flex-row md:items-center md:justify-between md:px-8">
        <p>{t("site.law")}</p>
        <Link href="/about-ai" className="min-h-11 content-center font-medium text-curtain-text underline">
          {t("site.aboutAi")}
        </Link>
      </div>
    </footer>
  );
}
