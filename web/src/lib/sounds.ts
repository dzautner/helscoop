"use client";

export type SoundName =
  | "save"
  | "error"
  | "chatReply"
  | "bomAdd"
  | "bomRemove"
  | "exportDone"
  | "cameraSnap";

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx || ctx.state === "closed") {
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone(
  audioCtx: AudioContext,
  freq: number,
  duration: number,
  gain: number,
  type: OscillatorType = "sine",
  ramp: "linear" | "exp" = "exp",
) {
  const osc = audioCtx.createOscillator();
  const vol = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  vol.gain.value = gain;
  osc.connect(vol);
  vol.connect(audioCtx.destination);
  const now = audioCtx.currentTime;
  osc.start(now);
  if (ramp === "exp") {
    vol.gain.exponentialRampToValueAtTime(0.001, now + duration);
  } else {
    vol.gain.linearRampToValueAtTime(0, now + duration);
  }
  osc.stop(now + duration);
}

function noise(audioCtx: AudioContext, duration: number, gain: number) {
  const bufferSize = Math.ceil(audioCtx.sampleRate * duration);
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.3;
  const src = audioCtx.createBufferSource();
  src.buffer = buffer;
  const vol = audioCtx.createGain();
  vol.gain.value = gain;
  vol.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  const filter = audioCtx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 800;
  filter.Q.value = 0.7;
  src.connect(filter);
  filter.connect(vol);
  vol.connect(audioCtx.destination);
  src.start(audioCtx.currentTime);
  src.stop(audioCtx.currentTime + duration);
}

const SOUNDS: Record<SoundName, (ctx: AudioContext) => void> = {
  save(c) {
    tone(c, 520, 0.08, 0.06, "sine");
    setTimeout(() => tone(c, 660, 0.1, 0.05, "sine"), 60);
  },
  error(c) {
    tone(c, 220, 0.15, 0.06, "triangle");
    setTimeout(() => tone(c, 180, 0.12, 0.04, "triangle"), 80);
  },
  chatReply(c) {
    tone(c, 880, 0.06, 0.03, "sine");
    setTimeout(() => tone(c, 1100, 0.08, 0.025, "sine"), 50);
  },
  bomAdd(c) {
    noise(c, 0.05, 0.04);
    tone(c, 440, 0.06, 0.04, "sine");
  },
  bomRemove(c) {
    tone(c, 380, 0.05, 0.03, "sine");
    noise(c, 0.04, 0.025);
  },
  exportDone(c) {
    tone(c, 440, 0.08, 0.04, "sine");
    setTimeout(() => tone(c, 554, 0.08, 0.035, "sine"), 70);
    setTimeout(() => tone(c, 660, 0.12, 0.04, "sine"), 140);
  },
  cameraSnap(c) {
    noise(c, 0.03, 0.035);
  },
};

export function playSound(name: SoundName): void {
  const audioCtx = getCtx();
  if (!audioCtx) return;
  try {
    SOUNDS[name](audioCtx);
  } catch {
    // Ignore audio playback failures silently
  }
}
