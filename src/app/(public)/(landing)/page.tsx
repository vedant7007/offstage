import type { Metadata } from "next";
import { TheatrePage } from "@/components/landing-theatre/theatre-page";
import en from "@/lib/i18n/en.json";
import { getT } from "@/lib/i18n/server";
import type { MessageKey, Translate } from "@/lib/i18n/translate";

export const metadata: Metadata = {
  title: { absolute: "OFFSTAGE: the show goes on" },
  description:
    "OFFSTAGE runs everything behind the show: fourteen AI agents, each with a human lead, on one shared source of truth. Built for Indian colleges, ready for any event.",
};

/** Translates every leaf of an en.json subtree by its dot path, keeping the tree's shape. */
function translateTree<T>(t: Translate, tree: T, path: string): T {
  return Object.fromEntries(
    Object.entries(tree as Record<string, unknown>).map(([k, v]) => [
      k,
      typeof v === "string" ? t(`${path}.${k}` as MessageKey) : translateTree(t, v, `${path}.${k}`),
    ]),
  ) as T;
}

export default async function Page() {
  // Translated here so the landing's client bundle carries no locale file.
  return <TheatrePage copy={translateTree(await getT(), en.theatre, "theatre")} />;
}
