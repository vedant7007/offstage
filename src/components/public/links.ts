// Routes the public pages link to. The demo slug matches the seeded HackNova event.
export const DEMO_EVENT_SLUG = "hacknova-2026";
export const CONSOLE_PATH = "/console";
/** The persona chooser in the showcase, the sign-in page in real mode. */
export const LOGIN_PATH = "/login";

export const eventPath = (slug: string) => `/e/${slug}`;

/** Source code. One place, so it can move to the public repo in one edit. */
export const REPO_URL = "https://github.com/vedant7007/sutradhar";
export const CONTACT_EMAIL = "vedantidlgave16@gmail.com";
export const CONTACT_MAILTO = `mailto:${CONTACT_EMAIL}?subject=OFFSTAGE%20enquiry`;
