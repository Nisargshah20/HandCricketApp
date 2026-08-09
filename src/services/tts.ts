// Native text-to-speech commentary (reliable on Android/iOS; falls back to the
// Web Speech API in the browser). Respects the in-app mute toggle.
import { TextToSpeech } from "@capacitor-community/text-to-speech";

let muted = false;
let voiceIndex: number | null = null;
let voiceResolved = false;

// Pick a male-sounding English voice if the engine exposes one (best effort).
async function resolveMaleVoice() {
  if (voiceResolved) return;
  voiceResolved = true;
  try {
    const { voices } = await TextToSpeech.getSupportedVoices();
    if (!voices || !voices.length) return;
    const indexed = voices.map((v, i) => ({ v, i }));
    const en = indexed.filter((x) => (x.v.lang || "").toLowerCase().startsWith("en"));
    const pool = en.length ? en : indexed;
    const male = pool.find(
      (x) => /male|\bman\b|_m_|-m-|guy/i.test(x.v.name || "") && !/female/i.test(x.v.name || "")
    );
    if (male) voiceIndex = male.i;
  } catch (e) {
    // ignore — fall back to the default voice
  }
}

export function setTtsMuted(value: boolean) {
  muted = value;
  if (value) {
    TextToSpeech.stop().catch(() => {});
  }
}

export async function speak(text: string) {
  if (muted || !text) return;
  const clean = text.replace(/["🏏🎙️]/g, "").trim();
  if (!clean) return;
  await resolveMaleVoice();
  try {
    await TextToSpeech.stop();
  } catch (e) {
    // nothing playing
  }
  try {
    await TextToSpeech.speak({
      text: clean,
      lang: "en-US",
      rate: 1.05,
      pitch: 0.8, // deeper tone for a masculine commentator voice
      volume: 1.0,
      category: "playback",
      ...(voiceIndex != null ? { voice: voiceIndex } : {}),
    });
  } catch (e) {
    // TTS engine unavailable — stay silent.
  }
}
