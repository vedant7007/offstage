import "../../src/server/load-env";
// pnpm voice:audio: the spoken test lines as 16 kHz WAV (1.5 s silence before, 2.5 s after), voiced by Murf.
// The organiser speaks in a different voice from Offstage. Writes tests/voice/audio/<id>.wav (git-ignored).
import { mkdir, writeFile } from "node:fs/promises";
import { CASES } from "./cases";

const RATE = 16000;
const silence = (s: number) => Buffer.alloc(Math.round(RATE * s) * 2);
const wav = (pcm: Buffer) => {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
};
const dir = new URL("audio/", import.meta.url);
await mkdir(dir, { recursive: true });
for (const c of CASES) {
  const r = await fetch("https://global.api.murf.ai/v1/speech/stream", {
    method: "POST",
    headers: { "api-key": process.env.MURF_API_KEY!, "content-type": "application/json" },
    body: JSON.stringify({
      text: c.say,
      voiceId: c.id === "hinglish" ? "en-IN-isha" : "en-IN-arohi",
      format: "PCM",
      sampleRate: RATE,
      model: "falcon-2",
    }),
  });
  if (!r.ok) throw new Error(`Murf ${r.status} for ${c.id}`);
  await writeFile(
    new URL(`${c.id}.wav`, dir),
    wav(Buffer.concat([silence(1.5), Buffer.from(await r.arrayBuffer()), silence(2.5)])),
  );
  console.log(`audio/${c.id}.wav`);
}
