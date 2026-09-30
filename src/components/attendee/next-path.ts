/** Only same-site paths, so a crafted link cannot send people elsewhere after sign-in. */
export function safeNext(next: string | null | undefined, fallback = "/me") {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback;
}
