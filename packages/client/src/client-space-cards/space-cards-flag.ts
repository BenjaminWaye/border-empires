// Flag for Space View's action cards (§30). On by default; `?space=legacy`
// opts this browser back into the older panel-only Space View and
// `?space=cards` turns the cards back on. Mirrors client-hud-v2-flag.ts.
export const SPACE_CARDS_STORAGE_KEY = "be.spaceCards";

type FlagStorage = Pick<Storage, "getItem" | "setItem">;

const safeStorage = (): FlagStorage | undefined => {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
};

export const readSpaceCardsFlag = (search: string, storage: FlagStorage | undefined = safeStorage()): boolean => {
  const param = new URLSearchParams(search).get("space");
  if (!storage) return param !== "legacy";
  try {
    if (param === "cards") storage.setItem(SPACE_CARDS_STORAGE_KEY, "1");
    if (param === "legacy") storage.setItem(SPACE_CARDS_STORAGE_KEY, "0");
    return storage.getItem(SPACE_CARDS_STORAGE_KEY) !== "0";
  } catch {
    return param !== "legacy";
  }
};
