// Minimal iCalendar file for "Add to calendar". Times are UTC instants, as stored.

type IcsEvent = {
  uid: string;
  title: string;
  start: string;
  end: string;
  location?: string;
  description?: string;
  url?: string;
};

const stamp = (iso: string) =>
  new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

/** Escapes text per RFC 5545: backslash, semicolon, comma and newlines. */
const text = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

export function buildIcs(e: IcsEvent, now: string = new Date().toISOString()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//OFFSTAGE//Event//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(e.start)}`,
    `DTEND:${stamp(e.end)}`,
    `SUMMARY:${text(e.title)}`,
    ...(e.location ? [`LOCATION:${text(e.location)}`] : []),
    ...(e.description ? [`DESCRIPTION:${text(e.description)}`] : []),
    ...(e.url ? [`URL:${e.url}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n") + "\r\n";
}

/** Triggers a download of the .ics file in the browser. */
export function downloadIcs(filename: string, ics: string) {
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
