// Which auto-garrison categories this player has already been asked about in the tile menu, and which
// checkbox to highlight right after a "No". New players never noticed the small checkbox, so until a
// category has been answered the tile menu shows a Yes/No question in its place; "No" turns it into the
// checkbox, highlighted, so they can see where to change their mind. Per-device (localStorage): the
// worst case on a new device is being asked once more.
import { AUTO_SETTLE_CATEGORIES, type AutoSettleCategory } from "@border-empires/shared";

const ASKED_STORAGE_KEY = "border-empires.autoGarrisonAsked";

let askedCache: Set<AutoSettleCategory> | undefined;
let declinedHighlight: { category: AutoSettleCategory; tileKey: string } | undefined;

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

/** After "No": highlight that category's checkbox while the player is still looking at the same tile. */
export const highlightDeclinedAutoSettle = (category: AutoSettleCategory, tileKey: string): void => {
  declinedHighlight = { category, tileKey };
};

/** True while the menu shows the tile the player just said "No" on; any other tile clears it. */
export const consumeDeclinedHighlight = (category: AutoSettleCategory, tileKey: string): boolean => {
  if (!declinedHighlight) return false;
  if (declinedHighlight.tileKey !== tileKey) {
    declinedHighlight = undefined;
    return false;
  }
  return declinedHighlight.category === category;
};

/** Test hook: forget the in-memory cache so a test can start from a fresh localStorage. */
export const resetAutoSettleAskStateForTests = (): void => {
  askedCache = undefined;
  declinedHighlight = undefined;
};
