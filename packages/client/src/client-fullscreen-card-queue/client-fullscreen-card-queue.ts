// One full-screen card at a time. A single action (capturing a town that
// held a waystation, say) used to stack the Town Captured card, the
// Waystation Activated card and the occupation survey popup on top of each
// other (10-persona playtest, 2026-11). Cards now line up here: the first
// shows, the next appears once it is dismissed.
//
// Two ways in:
// - enqueueFullscreenCard: a card that mounts once (town capture, waystation).
//   Its `show` mounts it, returns the mounted element (or undefined when there
//   was nothing to show) and calls `close` when the player dismisses it.
// - tryClaimFullscreenCard: a card driven by its own controller that re-checks
//   every frame (the occupation survey popup). It takes the slot only when it
//   is free and gives it back through the returned release.

export type FullscreenCardKey = "town-capture" | "waystation-activation" | "occupation-survey" | "unlock-celebration";

/** What the queue needs of a mounted card: whether it is still on the page (an HTMLElement fits). */
export type MountedFullscreenCard = { readonly isConnected: boolean };

export type FullscreenCard = {
  key: FullscreenCardKey;
  /** Mounts the card and returns it, or undefined when there turned out to be nothing to show. Calls `close` on dismissal. */
  show: (close: () => void) => MountedFullscreenCard | undefined;
};

type ActiveCard = { key: FullscreenCardKey; token: object; mounted: MountedFullscreenCard | undefined };

/**
 * While this returns true no new card shows (client-notice-gate.ts: a sheet or modal is open, or the player is
 * mid-tap). First-15 playtest (2026-11-28): Town Captured slid over the open House Charges panel and over the
 * next Explore tap, and took those taps. Installed at start-up; tests set their own.
 */
let held: () => boolean = () => false;
/** How often a held queue looks again. */
export const FULLSCREEN_CARD_HOLD_RETRY_MS = 250;
/** Taps on a card in its first moments were meant for what was under it, and are dropped. */
export const FULLSCREEN_CARD_ARRIVAL_GUARD_MS = 400;
let retry: ReturnType<typeof setTimeout> | undefined;

export const setFullscreenCardHold = (predicate: () => boolean): void => {
  held = predicate;
};

const scheduleRetry = (): void => {
  if (retry !== undefined) return;
  retry = setTimeout(() => {
    retry = undefined;
    flush();
  }, FULLSCREEN_CARD_HOLD_RETRY_MS);
};

/**
 * Whether a click on a card that appeared at `shownAt` is dropped: a real tap (trusted input) in the card's first
 * FULLSCREEN_CARD_ARRIVAL_GUARD_MS. Scripted clicks (keyboard activation aside, tests) are never dropped.
 */
export const dropsArrivalTap = (trusted: boolean, nowMs: number, shownAt: number): boolean =>
  trusted && nowMs - shownAt < FULLSCREEN_CARD_ARRIVAL_GUARD_MS;

/** A card that just appeared swallows real taps for a moment (capture phase, before its buttons see them). */
const guardArrivalTaps = (mounted: MountedFullscreenCard): void => {
  if (typeof Element === "undefined" || !(mounted instanceof Element)) return;
  const shownAt = Date.now();
  mounted.addEventListener("click", (event) => {
    if (!dropsArrivalTap(event.isTrusted, Date.now(), shownAt)) return;
    event.preventDefault();
    event.stopPropagation();
  }, { capture: true });
};

// At most one waiting card per key (a newer one of the same kind replaces it), so the queue never outgrows the keys.
const queue: FullscreenCard[] = [];
let active: ActiveCard | undefined;

/**
 * A card removed from the page without its close (a test teardown, a page-wide
 * cleanup) must not hold the slot forever, or every later card would wait.
 */
const dropStaleActive = (): void => {
  if (active?.mounted && !active.mounted.isConnected) active = undefined;
};

const flush = (): void => {
  dropStaleActive();
  while (!active) {
    if (queue.length > 0 && held()) {
      scheduleRetry();
      return;
    }
    const next = queue.shift();
    if (!next) return;
    const card: ActiveCard = { key: next.key, token: {}, mounted: undefined };
    active = card;
    let mounted: MountedFullscreenCard | undefined;
    try {
      mounted = next.show(() => release(card.token));
    } finally {
      // A card that showed nothing (or threw) gives the slot straight back.
      if (active === card) {
        if (mounted) {
          card.mounted = mounted;
          guardArrivalTaps(mounted);
        }
        else active = undefined;
      }
    }
  }
};

const release = (token: object): void => {
  if (active?.token !== token) return;
  active = undefined;
  flush();
};

/** Shows the card now if no other full-screen card is up, else queues it behind the current one. */
export const enqueueFullscreenCard = (card: FullscreenCard): void => {
  const waiting = queue.findIndex((queued) => queued.key === card.key);
  if (waiting >= 0) queue[waiting] = card;
  else queue.push(card);
  flush();
};

/**
 * Takes the slot for a self-managed card when nothing is showing or waiting;
 * returns its release, or undefined. `mounted` is the card's element, appended
 * to the page right after a successful claim.
 */
export const tryClaimFullscreenCard = (key: FullscreenCardKey, mounted: MountedFullscreenCard): (() => void) | undefined => {
  flush();
  if (active || queue.length > 0 || held()) return undefined;
  const token = {};
  active = { key, token, mounted };
  return () => release(token);
};

/**
 * The key of the card on screen now, if any. Flushes first, so a card that
 * left the page without its close hands the slot to the next waiting card
 * instead of leaving it stuck until some unrelated card is enqueued.
 */
export const activeFullscreenCard = (): FullscreenCardKey | undefined => {
  flush();
  return active?.key;
};

/** Cards waiting behind the one on screen. */
export const queuedFullscreenCardCount = (): number => queue.length;

/** Test-only: forgets the active card and the queue. */
export const resetFullscreenCardQueueForTests = (): void => {
  queue.length = 0;
  active = undefined;
  held = () => false;
  if (retry !== undefined) clearTimeout(retry);
  retry = undefined;
};
