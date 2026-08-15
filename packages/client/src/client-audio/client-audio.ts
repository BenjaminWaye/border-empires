// Procedural ambient background sound for Border Empires. Built entirely
// from Web Audio API oscillators rather than a licensed music file, so
// there's nothing to source, license, or ship as a binary asset.
//
// Playback only starts after the player's first pointer/key interaction —
// browsers block audio autoplay before a user gesture — and stays at a low
// default level so it reads as background ambience, not foreground music.
// Volume/mute are persisted device-wide (not per-account: it's a playback
// preference like a browser's own volume control, not game state).

const VOLUME_STORAGE_KEY = "be-ambient-audio-volume";
const MUTED_STORAGE_KEY = "be-ambient-audio-muted";
const DEFAULT_VOLUME = 0.35;

let audioContext: AudioContext | undefined;
let masterGain: GainNode | undefined;
let started = false;

const readStoredVolume = (): number => {
  try {
    const raw = window.localStorage.getItem(VOLUME_STORAGE_KEY);
    if (raw === null) return DEFAULT_VOLUME;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
};

const readStoredMuted = (): boolean => {
  try {
    const raw = window.localStorage.getItem(MUTED_STORAGE_KEY);
    // Default to muted for anyone who hasn't set a preference yet — ambient
    // audio should be opt-in, not opt-out.
    if (raw === null) return true;
    return raw === "1";
  } catch {
    return true;
  }
};

let volume = readStoredVolume();
let muted = readStoredMuted();

const applyGain = (): void => {
  if (!audioContext || !masterGain) return;
  const target = muted ? 0 : volume;
  masterGain.gain.setTargetAtTime(target, audioContext.currentTime, 0.4);
};

// Three slightly-detuned low oscillators through a slow-sweeping lowpass
// filter — reads as a living machine hum (fitting the steampunk setting)
// rather than a static tone.
const buildAmbientGraph = (ctx: AudioContext, destination: GainNode): void => {
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 400;
  filter.Q.value = 0.7;
  filter.connect(destination);

  const filterLfo = ctx.createOscillator();
  filterLfo.frequency.value = 0.05;
  const filterLfoGain = ctx.createGain();
  filterLfoGain.gain.value = 180;
  filterLfo.connect(filterLfoGain);
  filterLfoGain.connect(filter.frequency);
  filterLfo.start();

  const partials: Array<{ freq: number; type: OscillatorType; gain: number }> = [
    { freq: 55, type: "sawtooth", gain: 0.5 },
    { freq: 82.41, type: "sine", gain: 0.28 },
    { freq: 110.3, type: "sine", gain: 0.18 }
  ];
  for (const { freq, type, gain } of partials) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const oscGain = ctx.createGain();
    oscGain.gain.value = gain;
    osc.connect(oscGain);
    oscGain.connect(filter);
    osc.start();
  }
};

const resolveAudioContextCtor = (): typeof AudioContext | undefined => {
  if (typeof window === "undefined") return undefined;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
};

/** Builds the audio graph and begins playback. Safe to call more than once — only the first call does anything. */
export const startAmbientAudio = (): void => {
  if (started) return;
  const Ctx = resolveAudioContextCtor();
  if (!Ctx) return;
  started = true;
  audioContext = new Ctx();
  masterGain = audioContext.createGain();
  masterGain.gain.value = 0;
  masterGain.connect(audioContext.destination);
  buildAmbientGraph(audioContext, masterGain);
  applyGain();
  if (audioContext.state === "suspended") void audioContext.resume();
};

/** Registers one-time listeners that start ambient audio on the player's first interaction with the page, and pause it while the tab is hidden. */
export const initClientAudio = (): void => {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const unlock = (): void => {
    startAmbientAudio();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
  document.addEventListener("visibilitychange", () => {
    if (!audioContext) return;
    if (document.hidden) void audioContext.suspend();
    else if (!muted) void audioContext.resume();
  });
};

export const isAmbientAudioMuted = (): boolean => muted;
export const getAmbientAudioVolume = (): number => volume;

export const setAmbientAudioMuted = (next: boolean): void => {
  muted = next;
  try {
    window.localStorage.setItem(MUTED_STORAGE_KEY, next ? "1" : "0");
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
  applyGain();
};

export const setAmbientAudioVolume = (next: number): void => {
  volume = Math.min(1, Math.max(0, next));
  try {
    window.localStorage.setItem(VOLUME_STORAGE_KEY, String(volume));
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
  applyGain();
};
