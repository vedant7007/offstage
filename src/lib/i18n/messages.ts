import en from "./en.json";
import hi from "./hi.json";
import hinglish from "./hinglish.json";
import { withFallback, type Locale, type Messages } from "./translate";

const catalogue: Record<Locale, Messages> = {
  en,
  hi: withFallback(hi),
  hinglish: withFallback(hinglish),
};

export function getMessages(locale: Locale): Messages {
  return catalogue[locale];
}
