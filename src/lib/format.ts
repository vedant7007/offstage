/**
 * Display formatting for money, counts and masked contact details.
 * Indian digit grouping (3,00,000) is done by hand so output is identical on server and browser.
 */

/** 300000 -> "3,00,000", 1234.5 -> "1,234.5" */
export function formatIndianNumber(value: number, fractionDigits = 0): string {
  if (!Number.isFinite(value)) return "-";
  const negative = value < 0;
  const fixed = Math.abs(value).toFixed(fractionDigits);
  const [intPart = "0", frac] = fixed.split(".");
  let grouped: string;
  if (intPart.length <= 3) {
    grouped = intPart;
  } else {
    const last3 = intPart.slice(-3);
    const rest = intPart.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    grouped = `${rest},${last3}`;
  }
  return `${negative ? "-" : ""}${grouped}${frac ? `.${frac}` : ""}`;
}

/** 300000 -> "₹3,00,000". Pass paise = true when the amount is in paise. */
export function formatInr(amount: number, opts: { fractionDigits?: number; paise?: boolean } = {}): string {
  const rupees = opts.paise ? amount / 100 : amount;
  const s = formatIndianNumber(rupees, opts.fractionDigits ?? 0);
  return s.startsWith("-") ? `-₹${s.slice(1)}` : `₹${s}`;
}

/** Compact rupees for dashboards: 300000 -> "₹3 L", 12500000 -> "₹1.25 Cr", 45000 -> "₹45 K". */
export function formatInrShort(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  const trim = (n: number) => String(Number(n.toFixed(2)));
  if (abs >= 1e7) return `${sign}₹${trim(abs / 1e7)} Cr`;
  if (abs >= 1e5) return `${sign}₹${trim(abs / 1e5)} L`;
  if (abs >= 1e3) return `${sign}₹${trim(abs / 1e3)} K`;
  return `${sign}₹${trim(abs)}`;
}

/** 0.923 -> "92%". Input is a ratio, not a percentage. */
export function formatPercent(ratio: number, fractionDigits = 0): string {
  if (!Number.isFinite(ratio)) return "-";
  return `${(ratio * 100).toFixed(fractionDigits)}%`;
}

/** "+919876543210" -> "+91 ******3210". Keeps the country code and the last 4 digits. */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  // With a leading "+", everything before the last 10 digits is the country code.
  const ccDigits = phone.trim().startsWith("+") && digits.length > 10 ? digits.slice(0, -10) : "";
  const national = digits.slice(ccDigits.length);
  const prefix = ccDigits ? `+${ccDigits} ` : "";
  if (national.length <= 4) return `${prefix}${"*".repeat(national.length)}`;
  return `${prefix}${"*".repeat(national.length - 4)}${national.slice(-4)}`;
}

/** Any run of 10 or more digits (spaces and dashes allowed) in free text is a phone number: keep the last 4. */
export const maskPhones = (text: string) =>
  text.replace(/\+?\d[\d\s-]{8,}\d/g, (m) => (m.replace(/\D/g, "").length >= 10 ? maskPhone(m) : m));

/** "sneha.reddy@gmail.com" -> "sn***@gmail.com" */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return "";
  const at = email.lastIndexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const keep = local.length <= 2 ? 1 : 2;
  return `${local.slice(0, keep)}***@${domain}`;
}

/** "Sneha Reddy" -> "Sneha R." for places where a full name is not needed. */
export function shortName(fullName: string | null | undefined): string {
  if (!fullName) return "";
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0] ?? "";
  const last = parts[parts.length - 1] ?? "";
  return `${parts[0]} ${last.charAt(0).toUpperCase()}.`;
}
