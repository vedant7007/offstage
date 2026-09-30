/**
 * Email templates. Plain and short; every message says who sent it and why.
 * More templates (ticket, reminder, announcement, sponsor draft) arrive with the channel adapters.
 */

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

export function otpEmail(input: { otp: string; minutes: number; purpose: string }): RenderedEmail {
  const { otp, minutes } = input;
  const text = [
    `Your Sutradhar sign-in code is ${otp}.`,
    "",
    `It expires in ${minutes} minutes. If you did not ask for it, you can ignore this email.`,
    "Never share this code with anyone, including people who say they are organisers.",
  ].join("\n");
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1a1a1a">
<p>Your Sutradhar sign-in code is</p>
<p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:8px 0">${escapeHtml(otp)}</p>
<p>It expires in ${minutes} minutes. If you did not ask for it, you can ignore this email.</p>
<p style="color:#555">Never share this code with anyone, including people who say they are organisers.</p>
</body></html>`;
  return { subject: `${otp} is your Sutradhar code`, text, html };
}
