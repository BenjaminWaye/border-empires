// Which auto-garrison categories this player has already been asked about in the tile menu, and which
// checkbox to highlight right after a "No". New players never noticed the small checkbox, so until a
// category has been answered the tile menu shows a Yes/No question in its place; "No" turns it into the
// checkbox, highlighted, so they can see where to change their mind. Per-device (localStorage): the
// worst case on a new device is being asked once more.
import { AUTO_SETTLE_CATEGORIES, type AutoSettleCategory } from "@border-empires/shared";

const ASKED_STORAGE_KEY = "border-empires.autoGarrisonAsked";

let askedCache: Set<AutoSettleCategory> | undefined;
/** How long the checkbox stays highlighted after "No": long enough to notice, then it goes back to normal. */
export const DECLINED_HIGHLIGHT_MS = 20_000;
let declinedHighlight: { category: AutoSettleCategory; until: number } | undefined;

const readAsked = (): Set<AutoSettleCategory> => {
  if (askedCache) return askedCache;
  askedCache = new Set();
  try {
    const parsed: unknown = JSON.parse(globalThis.localStorage?.getItem(ASKED_STORAGE_KEY) ?? "[]");
    if (Array.isArray(parsed)) for (const value of parsed) if (AUTO_SETTLE_CATEGORIES.includes(value)) askedCache.add(value);
  } catch {
    // Storage blocked or malformed: ask again, which is harmless.
  }
  return askedCache;
};

export const hasAskedAutoSettle = (category: AutoSettleCategory): boolean => readAsked().has(category);

export const markAutoSettleAsked = (category: AutoSettleCategory): void => {
  const asked = readAsked();
  if (asked.has(category)) return;
  asked.add(category);
  try {
    globalThis.localStorage?.setItem(ASKED_STORAGE_KEY, JSON.stringify([...asked]));
  } catch {
    // Remembered for this session only.
  }
};

/** After "No": highlight that category's checkbox (on every panel showing it) for DECLINED_HIGHLIGHT_MS. */
export const highlightDeclinedAutoSettle = (category: AutoSettleCategory, now = Date.now()): void => {
  declinedHighlight = { category, until: now + DECLINED_HIGHLIGHT_MS };
};

/** Pure read: rendering never changes it, so panels showing different tiles agree regardless of render order. */
export const isDeclinedHighlightActive = (category: AutoSettleCategory, now = Date.now()): boolean =>
  declinedHighlight?.category === category && now < declinedHighlight.until;

/** Test hook: forget the in-memory cache so a test can start from a fresh localStorage. */
export const resetAutoSettleAskStateForTests = (): void => {
  askedCache = undefined;
  declinedHighlight = undefined;
};
