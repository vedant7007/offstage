import en from "./en.json";
import hi from "./hi.json";
import hinglish from "./hinglish.json";
import type { Locale, Messages } from "./translate";

type Tree = { [key: string]: string | Tree };

/** Fills keys missing from a translation with English, so a gap never shows a raw key. */
function withFallback(messages: object): Messages {
  const merge = (base: Tree, over: Tree): Tree => {
    const out: Tree = { ...base };
    for (const [k, v] of Object.entries(over)) {
      const b = base[k];
      out[k] = typeof v === "object" && typeof b === "object" ? merge(b, v) : v;
    }
    return out;
  };
  return merge(en as Tree, messages as Tree) as unknown as Messages;
}

const catalogue: Record<Locale, Messages> = {
  en,
  hi: withFallback(hi),
  hinglish: withFallback(hinglish),
};

export function getMessages(locale: Locale): Messages {
  return catalogue[locale];
}
