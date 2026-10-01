// Text-only voice turn checks: POSTs each conversation step to /api/agents/voice/turn in one signed-in session
// and checks intent, reply text, approval cards and time to first spoken line. No browser, no audio.
// Usage: tsx tests/voice/turns.ts [conversation ids...]. Needs the app on BASE_URL (default http://localhost:3000).

import type { VoiceEvent } from "../../src/contracts/api";
import { CONVERSATIONS, type Step } from "./conversations";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const only = process.argv.slice(2);
const convs = only.length ? CONVERSATIONS.filter((c) => only.includes(c.id)) : CONVERSATIONS;

const login = await fetch(`${BASE}/api/demo/switch-persona`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: BASE },
  body: JSON.stringify({ persona: "owner" }),
});
if (!login.ok) throw new Error(`Sign-in failed: HTTP ${login.status}`);
const cookie = login.headers
  .getSetCookie()
  .map((c) => c.split(";")[0])
  .join("; ");
if (!cookie) throw new Error("Sign-in returned no session cookie");

async function turn(text: string) {
  const start = Date.now();
  let firstSayMs: number | null = null;
  let intent = "";
  let by = "";
  let opened = false;
  const said: string[] = [];
  const errors: string[] = [];
  const res = await fetch(`${BASE}/api/agents/voice/turn`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE, cookie },
    body: JSON.stringify({ turnId: `t-${crypto.randomUUID()}`, text, via: "keyboard" }),
  });
  if (!res.ok || !res.body) {
    errors.push(`HTTP ${res.status}`);
    return { intent, by, firstSayMs, said: "", opened, errors };
  }
  const decoder = new TextDecoder();
  let buf = "";
  const handle = (line: string) => {
    if (!line.trim()) return;
    let ev: VoiceEvent;
    try {
      ev = JSON.parse(line) as VoiceEvent;
    } catch {
      errors.push(`bad line: ${line.slice(0, 60)}`);
      return;
    }
    if (ev.type === "intent") ({ intent, by } = ev);
    else if (ev.type === "say") {
      firstSayMs ??= Date.now() - start;
      said.push(ev.text);
    } else if (ev.type === "open") opened = true;
    else if (ev.type === "error") errors.push(ev.message);
  };
  const reader = res.body.getReader();
  // After an approval card opens the turn waits up to two minutes for the tap: read 1.5 s more, then stop.
  let stopAt = Number.POSITIVE_INFINITY;
  for (;;) {
    const wait = stopAt - Date.now();
    if (wait <= 0) {
      void reader.cancel();
      break;
    }
    const timer = new Promise<{ done: true; value: undefined }>((r) =>
      setTimeout(() => r({ done: true, value: undefined }), Math.min(wait, 90_000)),
    );
    const { done, value } = await Promise.race([reader.read(), timer]);
    if (opened && stopAt === Number.POSITIVE_INFINITY) stopAt = Date.now() + 1500;
    if (done) {
      if (stopAt !== Number.POSITIVE_INFINITY && Date.now() < stopAt) continue;
      void reader.cancel();
      break;
    }
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    lines.forEach(handle);
    if (opened && stopAt === Number.POSITIVE_INFINITY) stopAt = Date.now() + 1500;
  }
  handle(buf + decoder.decode());
  return { intent, by, firstSayMs, said: said.join(" "), opened, errors };
}

function check(step: Step, r: Awaited<ReturnType<typeof turn>>) {
  const why: string[] = [...r.errors.map((e) => `error: ${e}`)];
  const want = Array.isArray(step.intent) ? step.intent : [step.intent];
  if (!want.includes(r.intent)) why.push(`intent ${r.intent || "none"}, want ${want.join("|")}`);
  for (const re of step.reply ?? []) if (!re.test(r.said)) why.push(`missing ${re}`);
  for (const re of step.never ?? []) if (re.test(r.said)) why.push(`said ${re}`);
  if (step.opens !== undefined && step.opens !== r.opened)
    why.push(step.opens ? "no open" : "unexpected open");
  if (step.maxFirstSayMs !== undefined && (r.firstSayMs === null || r.firstSayMs > step.maxFirstSayMs))
    why.push(`first say ${r.firstSayMs ?? "never"} ms > ${step.maxFirstSayMs}`);
  return why;
}

let passed = 0;
let total = 0;
for (const c of convs) {
  for (const step of c.steps) {
    total++;
    const r = await turn(step.say);
    const why = check(step, r);
    if (!why.length) passed++;
    console.log(
      `${why.length ? "FAIL" : "pass"} ${c.id.padEnd(10)} "${step.say}" -> ${r.intent || "none"}/${r.by || "-"} ` +
        `${String(r.firstSayMs ?? "-").padStart(5)} ms  "${r.said.slice(0, 120)}"  ${why.join("; ")}`,
    );
  }
}
console.log(`\n${passed}/${total} passed.`);
process.exit(passed === total ? 0 : 1);
