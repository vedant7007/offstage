import en from "./en.json";

export const LOCALES = ["en", "hi", "hinglish"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "sutradhar-locale";

/** Value for the html lang attribute. Hinglish is Hindi written in Latin script. */
export const HTML_LANG: Record<Locale, string> = {
  en: "en-IN",
  hi: "hi",
  hinglish: "hi-Latn",
};

export type Messages = typeof en;

type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${P}${K}`
    : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

/** Every translation key in en.json, as a dot path. Typos fail typecheck. */
export type MessageKey = Leaves<Messages>;
export type TranslateVars = Record<string, string | number>;
export type Translate = (key: MessageKey, vars?: TranslateVars) => string;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

type Tree = { [key: string]: string | Tree };

/** Fills keys missing from a translation with English, so a gap never shows a raw key. */
export function withFallback(messages: object): Messages {
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

function lookup(messages: Messages, key: string): string | undefined {
  let node: unknown = messages;
  for (const part of key.split(".")) {
    node = (node as Record<string, unknown> | undefined)?.[part];
  }
  return typeof node === "string" ? node : undefined;
}

/**
 * Plurals: when vars.count is 1 and a sibling key ending in "_one" exists, that key is used,
 * so "impact.sessions" with count 1 reads "1 session" from "impact.sessions_one".
 */
export function createTranslator(messages: Messages): Translate {
  return (key, vars) => {
    const singular = vars?.count === 1 ? lookup(messages, `${key}_one`) : undefined;
    const text = singular ?? lookup(messages, key) ?? key;
    if (!vars) return text;
    return text.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in vars ? String(vars[name]) : match,
    );
  };
}
