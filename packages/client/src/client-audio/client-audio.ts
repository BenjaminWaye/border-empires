// Dynamic soundtrack for Border Empires. A looping music bed reacts to
// conflict state (calm / an attack approaching or marching out / an active
// battle), and short location themes play once over the top when the player
// looks at a town, dock, or natural wonder tile — ducking the music bed out
// and fading it back in afterward.
//
// Playback only starts after the player's first pointer/key interaction —
// browsers block audio autoplay before a user gesture. Volume/mute are
// persisted device-wide (not per-account: it's a playback preference like a
// browser's own volume control, not game state), and the soundtrack is on
// by default.

const VOLUME_STORAGE_KEY = "be-ambient-audio-volume";
const MUTED_STORAGE_KEY = "be-ambient-audio-muted";
const DEFAULT_VOLUME = 0.35;
const FADE_MS = 900;
const LOCATION_THEME_RESUME_DELAY_MS = 600;

type MusicMode = "calm" | "tension" | "combat";
export type LocationTheme = "town" | "dock" | "wonder";

const CALM_TRACKS = ["/audio/aether-forger-frontier.m4a", "/audio/aetherium-frontier.m4a"];
const TENSION_TRACKS = ["/audio/march.m4a", "/audio/front.m4a"];
const COMBAT_TRACKS = ["/audio/battle-v1.m4a", "/audio/battle-v2.m4a"];
const LOCATION_TRACKS: Record<LocationTheme, string> = {
  town: "/audio/town.m4a",
  dock: "/audio/dock.m4a",
  wonder: "/audio/wonder.m4a"
};

let musicElement: HTMLAudioElement | undefined;
let sfxElement: HTMLAudioElement | undefined;
let musicMode: MusicMode = "calm";
let calmIndex = 0;
let started = false;
let ducked = false;
let locationThemeResumeTimeout: ReturnType<typeof setTimeout> | undefined;
let musicFadeGen = 0;
let retryArmed = false;
let armedRetryListener: (() => void) | undefined;
let consecutiveTrackErrors = 0;

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

const targetVolume = (): number => (muted ? 0 : volume);

const applyGain = (): void => {
  if (musicElement) musicElement.volume = targetVolume();
  if (sfxElement) sfxElement.volume = targetVolume();
};

// `isCurrent` lets a fade check, on every frame, whether a newer fade of the
// same element has since started — if so it bows out instead of fighting
// the newer one over `el.volume`.
const fadeVolume = (el: HTMLAudioElement, to: number, durationMs: number, isCurrent: () => boolean, onDone?: () => void): void => {
  const from = el.volume;
  const startTime = performance.now();
  const step = (now: number): void => {
    if (!isCurrent()) return;
    const t = Math.min(1, Math.max(0, (now - startTime) / durationMs));
    el.volume = Math.min(1, Math.max(0, from + (to - from) * t));
    if (t < 1) requestAnimationFrame(step);
    else onDone?.();
  };
  requestAnimationFrame(step);
};

const fadeMusicVolume = (to: number, durationMs: number, onDone?: () => void): void => {
  if (!musicElement) return;
  const gen = ++musicFadeGen;
  fadeVolume(musicElement, to, durationMs, () => gen === musicFadeGen, onDone);
};

const randomTrack = (urls: readonly string[]): string => urls[Math.floor(Math.random() * urls.length)] as string;

/** The track to start playing when entering `mode` — sequential for the calm playlist, random for tension/combat. */
const trackForModeEntry = (mode: MusicMode): string => {
  if (mode === "tension") return randomTrack(TENSION_TRACKS);
  if (mode === "combat") return randomTrack(COMBAT_TRACKS);
  calmIndex = 0;
  return CALM_TRACKS[0] as string;
};

const currentPlaylistLength = (): number => {
  if (musicMode === "tension") return TENSION_TRACKS.length;
  if (musicMode === "combat") return COMBAT_TRACKS.length;
  return CALM_TRACKS.length;
};

/** Removes a pending retry-on-interaction listener, if one is armed. Called before every fresh play() attempt so a listener from an earlier failure can't outlive it — otherwise a later, unrelated interaction could trigger a stale extra play() call. */
const disarmRetry = (): void => {
  if (!retryArmed || typeof window === "undefined") return;
  retryArmed = false;
  if (armedRetryListener) {
    window.removeEventListener("pointerdown", armedRetryListener);
    window.removeEventListener("keydown", armedRetryListener);
    armedRetryListener = undefined;
  }
};

/** Re-attempts play() on the player's next pointer/key interaction. Used when play() is rejected (e.g. the browser's autoplay policy blocked a resume after the tab was backgrounded) instead of leaving playback silently stalled forever. Idempotent — a failure while a retry is already armed doesn't stack listeners. */
const armRetryOnNextInteraction = (): void => {
  if (retryArmed || typeof window === "undefined") return;
  retryArmed = true;
  const retry = (): void => {
    retryArmed = false;
    armedRetryListener = undefined;
    window.removeEventListener("pointerdown", retry);
    window.removeEventListener("keydown", retry);
    if (!muted) attemptPlay();
  };
  armedRetryListener = retry;
  window.addEventListener("pointerdown", retry, { once: true });
  window.addEventListener("keydown", retry, { once: true });
};

/** Calls play() on the current music track, catching rejection (autoplay block, transient failure) instead of leaving an unhandled promise rejection — and arms a retry for the next user gesture. */
const attemptPlay = (): void => {
  if (!musicElement) return;
  disarmRetry();
  musicElement.play().catch(() => armRetryOnNextInteraction());
};

const playMusicUrl = (url: string): void => {
  if (!musicElement) return;
  musicElement.src = url;
  applyGain();
  attemptPlay();
};

const handleMusicEnded = (): void => {
  if (musicMode === "calm") {
    calmIndex = (calmIndex + 1) % CALM_TRACKS.length;
    playMusicUrl(CALM_TRACKS[calmIndex] as string);
  } else if (musicMode === "tension") {
    playMusicUrl(randomTrack(TENSION_TRACKS));
  } else {
    playMusicUrl(randomTrack(COMBAT_TRACKS));
  }
};

/** Builds the music element and begins playback. Safe to call more than once — after the first call, later calls just retry playback (e.g. re-enabling via the settings checkbox after a prior play() failure). */
export const startAmbientAudio = (): void => {
  if (started) {
    if (!muted) attemptPlay();
    return;
  }
  if (typeof window === "undefined" || typeof Audio === "undefined") return;
  started = true;
  musicElement = new Audio();
  musicElement.addEventListener("ended", handleMusicEnded);
  musicElement.addEventListener("playing", () => {
    consecutiveTrackErrors = 0;
  });
  musicElement.addEventListener("error", () => {
    consecutiveTrackErrors += 1;
    // The whole current playlist failing back-to-back means the files
    // themselves are broken — stop rather than spin forever cycling dead URLs.
    if (consecutiveTrackErrors >= currentPlaylistLength()) return;
    handleMusicEnded();
  });
  playMusicUrl(trackForModeEntry(musicMode));
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
    if (document.hidden) {
      musicElement?.pause();
      sfxElement?.pause();
      return;
    }
    if (muted) return;
    attemptPlay();
    sfxElement?.play().catch(() => {
      // Ignore — e.g. the tab was hidden again before this play() resolved,
      // interrupting it with a pause(). Nothing to resume here (unlike the
      // music bed, a location theme isn't retried on the next interaction).
    });
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

/**
 * Crossfades the looping music bed to reflect current conflict state.
 * Call this from the game loop with the latest combat/tension signals —
 * a no-op unless the derived mode actually changed. Combat (a muster flag
 * set to ADVANCE, or an active battle) takes priority over tension (a
 * muster flag staged at HOLD), which takes priority over calm.
 */
export const updateMusicForGameState = (input: { combat: boolean; tension: boolean }): void => {
  const nextMode: MusicMode = input.combat ? "combat" : input.tension ? "tension" : "calm";
  if (nextMode === musicMode) return;
  musicMode = nextMode;
  if (!started || !musicElement) return; // picked up by trackForModeEntry() once startAmbientAudio() runs
  if (ducked) {
    // A location theme is playing over a silenced, paused music bed — just
    // line up the new mode's track; playLocationTheme's own resume timer
    // will play() and fade it in once the one-shot finishes.
    musicElement.pause();
    musicElement.src = trackForModeEntry(musicMode);
    musicElement.volume = 0;
    return;
  }
  fadeMusicVolume(0, FADE_MS, () => {
    playMusicUrl(trackForModeEntry(musicMode));
    if (musicElement) musicElement.volume = 0;
    fadeMusicVolume(targetVolume(), FADE_MS);
  });
};

/**
 * Plays a location theme once (town/dock/natural wonder), ducking the music
 * bed out while it plays and fading the bed back in a short beat after it
 * ends. Safe to call repeatedly — a new theme cuts off whatever one-shot is
 * already playing.
 */
export const playLocationTheme = (theme: LocationTheme): void => {
  if (!started || typeof window === "undefined" || typeof Audio === "undefined") return;
  if (locationThemeResumeTimeout) {
    clearTimeout(locationThemeResumeTimeout);
    locationThemeResumeTimeout = undefined;
  }
  if (!sfxElement) {
    sfxElement = new Audio();
    sfxElement.addEventListener("ended", () => {
      locationThemeResumeTimeout = setTimeout(() => {
        ducked = false;
        if (!musicElement) return;
        musicElement.volume = 0;
        attemptPlay();
        fadeMusicVolume(targetVolume(), FADE_MS * 2);
      }, LOCATION_THEME_RESUME_DELAY_MS);
    });
  }
  ducked = true;
  fadeMusicVolume(0, FADE_MS, () => musicElement?.pause());
  sfxElement.pause();
  sfxElement.src = LOCATION_TRACKS[theme];
  sfxElement.currentTime = 0;
  sfxElement.volume = targetVolume();
  void sfxElement.play();
};
