import { cookies } from "next/headers";
import { getMessages } from "./messages";
import {
  createTranslator,
  DEFAULT_LOCALE,
  isLocale,
  LOCALE_COOKIE,
  type Locale,
  type Translate,
} from "./translate";

export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** Translator for server components. */
export async function getT(): Promise<Translate> {
  return createTranslator(getMessages(await getLocale()));
}
