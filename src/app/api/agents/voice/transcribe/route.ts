import { TranscribeResponse } from "@/contracts/api";
import { SpeechError, transcribe } from "@/ai/voice/speech";
import { getActor, requirePermission } from "@/server/authz";
import { HttpError, assertSameOrigin, badRequest, json, route } from "@/server/http";
import { enforce } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

/** About 30 s of Opus audio; a spoken command is a few seconds. */
const MAX_BYTES = 1_000_000;

// One spoken command (multipart field "audio") to text with Groq whisper. Console members who can command agents.
export const POST = route(async (req) => {
  assertSameOrigin(req);
  const actor = await getActor(req);
  requirePermission(actor, "agents.command", { eventId: actor.eventId });
  await enforce(`voice-stt:${actor.userId}`, 40, 60, "Too many voice commands. Wait a minute.");
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES + 10_000) throw badRequest("That recording is too long");
  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof Blob) || !audio.size) throw badRequest("Send the recording as the audio field");
  if (audio.size > MAX_BYTES) throw badRequest("That recording is too long");
  if (audio.type && !audio.type.startsWith("audio/")) throw badRequest("Only audio is accepted");
  try {
    return json(TranscribeResponse, await transcribe(audio, `voice-stt:${actor.userId}`));
  } catch (err) {
    if (err instanceof SpeechError)
      throw new HttpError(err.code === "cap" ? "rate_limited" : "internal", err.message);
    throw err;
  }
});
