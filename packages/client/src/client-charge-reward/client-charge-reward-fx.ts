// Effects for the season-end charge reward: particle bursts, the Domain score
// count-up, a synthesized chime and a haptic tap. All of them degrade to
// nothing when the browser lacks the API, the player muted audio, or the
// player prefers reduced motion.
import type { HouseChargeRarity } from "@border-empires/shared";
import { getAmbientAudioVolume, isAmbientAudioMuted } from "../client-audio/client-audio.js";

export const prefersReducedMotion = (): boolean => {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  } catch {
    return false;
  }
};

const BURST_PARTICLES: Readonly<Record<HouseChargeRarity, number>> = { COMMON: 18, RARE: 30, MYTHIC: 48 };

/** Sparks and a shockwave ring bursting from the middle of `host` (a card slot). Removed after they fade. */
export const burstFrom = (host: HTMLElement, rarity: HouseChargeRarity): void => {
  if (prefersReducedMotion()) return;
  const burst = document.createElement("div");
  burst.className = `cr-burst rarity-${rarity.toLowerCase()}`;
  burst.setAttribute("aria-hidden", "true");
  const count = BURST_PARTICLES[rarity];
  let html = `<span class="cr-ring"></span><span class="cr-ring cr-ring-late"></span>`;
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2 + Math.random() * 0.4;
    const distance = 70 + Math.random() * (rarity === "MYTHIC" ? 170 : 110);
    const size = 4 + Math.random() * (rarity === "COMMON" ? 4 : 7);
    html += `<span class="cr-spark" style="--dx:${(Math.cos(angle) * distance).toFixed(1)}px;--dy:${(Math.sin(angle) * distance).toFixed(1)}px;--s:${size.toFixed(1)}px;--d:${Math.round(Math.random() * 120)}ms"></span>`;
  }
  burst.innerHTML = html;
  host.appendChild(burst);
  window.setTimeout(() => burst.remove(), 1600);
};

const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

/**
 * Counts `el` from `from` to `to` over `durationMs`, pulsing on each whole step; resolves when done. Once
 * `cancelled()` is true it stops writing and resolves (Skip has already shown the final total).
 */
export const countUp = (el: HTMLElement, from: number, to: number, durationMs: number, cancelled: () => boolean = () => false): Promise<void> =>
  new Promise((resolve) => {
    if (cancelled()) {
      resolve();
      return;
    }
    const format = (value: number): string => Math.round(value).toLocaleString();
    if (prefersReducedMotion() || durationMs <= 0 || to === from || typeof window.requestAnimationFrame !== "function") {
      el.textContent = format(to);
      resolve();
      return;
    }
    // Timed from the first frame's own timestamp, so the clock always matches the frames'.
    let start: number | undefined;
    let shown = Math.round(from);
    el.textContent = format(from);
    const step = (now: number): void => {
      if (cancelled()) {
        resolve();
        return;
      }
      start ??= now;
      const t = Math.min(1, (now - start) / durationMs);
      const value = Math.round(from + (to - from) * easeOutCubic(t));
      if (value !== shown) {
        shown = value;
        el.textContent = format(value);
        el.classList.remove("is-tick");
        void el.offsetWidth; // restart the pulse animation
        el.classList.add("is-tick");
      }
      if (t < 1) window.requestAnimationFrame(step);
      else resolve();
    };
    window.requestAnimationFrame(step);
  });

let audioContext: AudioContext | undefined;
const context = (): AudioContext | undefined => {
  if (isAmbientAudioMuted()) return undefined;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return undefined;
    audioContext ??= new Ctor();
    if (audioContext.state === "suspended") void audioContext.resume();
    return audioContext;
  } catch {
    return undefined;
  }
};

/** Call from the Collect tap: browsers only allow audio to start inside a user gesture. */
export const unlockRewardAudio = (): void => {
  context();
};

const tone = (ctx: AudioContext, frequency: number, at: number, length: number, peak: number, type: OscillatorType = "triangle"): void => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, at);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + length + 0.05);
};

// A major pentatonic climbing one step per card, so a run of cards rises.
const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98];
const ARPEGGIO: Readonly<Record<HouseChargeRarity, number[]>> = { COMMON: [0, 2], RARE: [0, 2, 4], MYTHIC: [0, 2, 4, 7] };

/** A rising chime for the `index`th card revealed; rarer cards ring longer. */
export const playCardChime = (index: number, rarity: HouseChargeRarity): void => {
  const ctx = context();
  if (!ctx) return;
  const peak = Math.max(0.02, getAmbientAudioVolume()) * 0.35;
  const now = ctx.currentTime;
  ARPEGGIO[rarity].forEach((offset, step) => {
    const frequency = SCALE[Math.min(SCALE.length - 1, index + offset)]!;
    tone(ctx, frequency, now + step * 0.07, rarity === "MYTHIC" ? 1.1 : 0.6, peak);
    if (rarity !== "COMMON") tone(ctx, frequency * 2, now + step * 0.07 + 0.02, 0.4, peak * 0.25, "sine");
  });
};

/** The closing chord when the Domain score lands. */
export const playTotalChime = (): void => {
  const ctx = context();
  if (!ctx) return;
  const peak = Math.max(0.02, getAmbientAudioVolume()) * 0.3;
  const now = ctx.currentTime;
  [261.63, 329.63, 392, 523.25, 659.25].forEach((frequency, step) => tone(ctx, frequency, now + step * 0.04, 1.6, peak, step < 3 ? "triangle" : "sine"));
};

export const hapticTap = (pattern: number | number[]): void => {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not supported: silent.
  }
};
