// Background soundtrack for Border Empires — loops through the two music
// tracks in /audio, playing one after another and wrapping back to the
// start. Uses a plain HTMLAudioElement rather than the Web Audio API so it
// works the same everywhere <audio> does.
//
// Playback only starts after the player's first pointer/key interaction —
// browsers block audio autoplay before a user gesture. Volume/mute are
// persisted device-wide (not per-account: it's a playback preference like a
// browser's own volume control, not game state), and the soundtrack is on
// by default.

const VOLUME_STORAGE_KEY = "be-ambient-audio-volume";
const MUTED_STORAGE_KEY = "be-ambient-audio-muted";
const DEFAULT_VOLUME = 0.35;

const TRACK_URLS = ["/audio/aether-forger-frontier.m4a", "/audio/aetherium-frontier.m4a"];

let audioElement: HTMLAudioElement | undefined;
let trackIndex = 0;
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
    // Default to unmuted for anyone who hasn't set a preference yet — the
    // background soundtrack is on by default.
    if (raw === null) return false;
    return raw === "1";
  } catch {
    return false;
  }
};

let volume = readStoredVolume();
let muted = readStoredMuted();

const applyGain = (): void => {
  if (!audioElement) return;
  audioElement.volume = muted ? 0 : volume;
};

const playTrack = (index: number): void => {
  if (!audioElement) return;
  trackIndex = ((index % TRACK_URLS.length) + TRACK_URLS.length) % TRACK_URLS.length;
  audioElement.src = TRACK_URLS[trackIndex] as string;
  applyGain();
  void audioElement.play();
};

/** Builds the audio element and begins playback. Safe to call more than once — only the first call does anything. */
export const startAmbientAudio = (): void => {
  if (started) return;
  if (typeof window === "undefined" || typeof Audio === "undefined") return;
  started = true;
  audioElement = new Audio();
  audioElement.addEventListener("ended", () => playTrack(trackIndex + 1));
  playTrack(0);
};

/** Registers one-time listeners that start the soundtrack on the player's first interaction with the page, and pause it while the tab is hidden. */
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
    if (!audioElement) return;
    if (document.hidden) audioElement.pause();
    else if (!muted) void audioElement.play();
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
