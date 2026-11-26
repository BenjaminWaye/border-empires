// The unlock celebration: a centred full-screen card for an achievement just
// earned or a House Charge just completed (owner 2026-11-25: unlocks should be
// animated and front and centre). It goes through the shared full-screen card
// queue (client-fullscreen-card-queue.ts), so it never stacks on Town Captured
// or a waystation card, and several unlocks show one after another.
//
// Tap anywhere, Nice or Escape closes it; it also closes itself after
// CELEBRATION_AUTO_DISMISS_MS. Once closed the element is removed from the page,
// so it can never sit over the map and swallow taps.
import { enqueueFullscreenCard } from "../client-fullscreen-card-queue/client-fullscreen-card-queue.js";
import { prefersReducedMotion } from "../client-charge-reward/client-charge-reward-fx.js";
import "./client-unlock-celebration.css";

export type UnlockCelebration = {
  kind: "achievement" | "charge";
  /** Short kicker above the name, e.g. "Achievement earned". */
  eyebrow: string;
  title: string;
  /** One terse line: the goal met, or the reward. */
  line: string;
  /** Trusted markup for the badge (a seal glyph or the charge's emblem SVG). */
  iconHtml: string;
};

export const CELEBRATION_AUTO_DISMISS_MS = 6_000;
export const UNLOCK_CELEBRATION_CLASS = "unlock-celebration";

const RAYS = 12;

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Celebrations waiting for their turn, oldest first. The queue slot holds at most one of them at a time. */
const pending: UnlockCelebration[] = [];

const requestSlot = (): void => {
  if (pending.length === 0) return;
  enqueueFullscreenCard({
    key: "unlock-celebration",
    show: (close) => {
      const next = pending.shift();
      if (!next) return undefined;
      return mountCelebration(next, () => {
        close();
        requestSlot();
      });
    }
  });
};

/** Shows the celebration now, or after the full-screen card (or celebration) already on screen. */
export const queueUnlockCelebration = (celebration: UnlockCelebration): void => {
  pending.push(celebration);
  requestSlot();
};

/** Celebrations not yet shown. */
export const pendingUnlockCelebrationCount = (): number => pending.length;

/** Test-only. */
export const resetUnlockCelebrationsForTests = (): void => {
  pending.length = 0;
};

const celebrationHtml = (celebration: UnlockCelebration, still: boolean): string => {
  const rays = still ? "" : `<span class="uc-burst" aria-hidden="true">${Array.from({ length: RAYS }, (_, index) => `<i style="--uc-ray:${index}"></i>`).join("")}</span>`;
  return `<div class="uc-card" role="dialog" aria-modal="true" aria-labelledby="uc-title">
    ${rays}
    <span class="uc-icon" aria-hidden="true">${celebration.iconHtml}</span>
    <p class="uc-eyebrow">${esc(celebration.eyebrow)}</p>
    <h2 class="uc-title" id="uc-title">${esc(celebration.title)}</h2>
    <p class="uc-line">${esc(celebration.line)}</p>
    <button type="button" class="uc-close" data-uc-close>Nice</button>
  </div>`;
};

/** Input that must never reach the map or a sheet below while the card is up. */
const SWALLOWED_EVENTS = ["pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend", "wheel"] as const;

const mountCelebration = (celebration: UnlockCelebration, done: () => void): HTMLElement => {
  const still = prefersReducedMotion();
  const overlay = document.createElement("div");
  overlay.className = `${UNLOCK_CELEBRATION_CLASS} kind-${celebration.kind}${still ? " is-still" : ""}`;
  overlay.innerHTML = celebrationHtml(celebration, still);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    dismiss();
  };
  const dismiss = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    window.removeEventListener("keydown", onKeyDown, true);
    if (!overlay.isConnected) return;
    overlay.remove();
    done();
  };
  for (const type of SWALLOWED_EVENTS) overlay.addEventListener(type, (event) => event.stopPropagation(), { passive: true });
  overlay.addEventListener("click", (event) => {
    event.stopPropagation();
    dismiss();
  });
  window.addEventListener("keydown", onKeyDown, true);
  timer = setTimeout(dismiss, CELEBRATION_AUTO_DISMISS_MS);

  document.body.appendChild(overlay);
  overlay.querySelector<HTMLButtonElement>("[data-uc-close]")?.focus({ preventScroll: true });
  return overlay;
};
