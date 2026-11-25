// Which rival relic sites the player has already brought on screen. The edge
// tab that points to an off-screen relic shows only until then (owner call
// 2026-11-25: show it once, until the player has scrolled to the relic).
// Keyed by House and site, so a new House operating the site gets one tab again.
const STORAGE_KEY = "be.reachedRelicSites";
const MAX_REMEMBERED = 64;

let reached: Set<string> | undefined;

const load = (): Set<string> => {
  if (reached) return reached;
  reached = new Set();
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(list)) for (const entry of list) if (typeof entry === "string") reached.add(entry);
  } catch {
    // Storage blocked or corrupt: the tab shows again until the site is reached this session.
  }
  return reached;
};

const keyOf = (ownerId: string, siteKey: string): string => `${ownerId}@${siteKey}`;

export const relicSiteReached = (ownerId: string, siteKey: string): boolean => load().has(keyOf(ownerId, siteKey));

export const markRelicSiteReached = (ownerId: string, siteKey: string): void => {
  const set = load();
  const key = keyOf(ownerId, siteKey);
  if (set.has(key)) return;
  set.add(key);
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify([...set].slice(-MAX_REMEMBERED)));
  } catch {
    // Remembered for this session only.
  }
};

/** Test seam: forget reached sites and re-read storage on next use. */
export const resetRelicSitesReachedForTest = (): void => { reached = undefined; };
