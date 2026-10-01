import { VoiceTtsRequest } from "@/contracts/api";
import { SpeechError, TTS_SAMPLE_RATE, speak } from "@/ai/voice/speech";
import { getActor, requirePermission } from "@/server/authz";
import { HttpError, assertSameOrigin, readJson, route } from "@/server/http";
import { enforce } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

// One sentence to speech with Murf Falcon, streamed as raw 16-bit mono PCM so playback starts on the first chunk.
export const POST = route(async (req) => {
  assertSameOrigin(req);
  const actor = await getActor(req);
  requirePermission(actor, "agents.command", { eventId: actor.eventId });
  const body = await readJson(req, VoiceTtsRequest);
  await enforce(`voice-tts:${actor.userId}`, 240, 600, "Too much speech. Wait a few minutes.");
  try {
    const { body: audio, costUsd } = await speak(body.text, body.voiceId, `voice:${body.turnId}`, req.signal);
    return new Response(audio, {
      headers: {
        "content-type": "audio/pcm",
        "cache-control": "no-store",
        "x-sample-rate": String(TTS_SAMPLE_RATE),
        "x-cost-usd": costUsd.toFixed(6),
      },
    });
  } catch (err) {
    if (err instanceof SpeechError)
      throw new HttpError(err.code === "cap" ? "rate_limited" : "internal", err.message);
    throw err;
  }
});
