// Native text-to-speech commentary (reliable on Android/iOS; falls back to the
// Web Speech API in the browser). Respects the in-app mute toggle.
import { TextToSpeech } from "@capacitor-community/text-to-speech";

let muted = false;

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
  try {
    await TextToSpeech.stop();
  } catch (e) {
    // nothing playing
  }
  try {
    await TextToSpeech.speak({
      text: clean,
      lang: "en-US",
      rate: 1.1,
      pitch: 1.05,
      volume: 1.0,
      category: "playback",
    });
  } catch (e) {
    // TTS engine unavailable — stay silent.
  }
}
