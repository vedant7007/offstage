// Turn raw codes from runs and reports into words a student organiser reads at a glance.

/** "registration.checked_in" -> "Registration checked in". */
export const humanize = (s: string) => {
  const w = s.replace(/[._]+/g, " ").trim();
  return w.charAt(0).toUpperCase() + w.slice(1);
};

/** 870 -> "870 ms", 6541 -> "6.5 s". */
export const duration = (ms: number) => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`);

const CHANNEL: Record<string, string> = {
  in_app: "In-app",
  email: "Email",
  sms: "SMS",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
};
export const channelName = (c: string) => CHANNEL[c] ?? humanize(c);

/** Agent-written summaries as sentences: a capital first letter and no stray ": ." left by a template. */
export const sentence = (s: string) => {
  const t = s.replace(/:\s*\.\s*/g, ": ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};
