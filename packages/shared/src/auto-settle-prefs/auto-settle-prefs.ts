// Per-player, per-category opt-in for the server's auto-settle (spends
// SETTLE_MANPOWER_COST on eligible FRONTIER tiles without a click). Shared by
// apps/simulation (the gate) and packages/client (the join prompt + settings),
// so both agree on which category a tile belongs to.
export type AutoSettleCategory = "towns" | "food" | "resources";

export const AUTO_SETTLE_CATEGORIES: readonly AutoSettleCategory[] = ["towns", "food", "resources"];

export type AutoSettlePrefs = {
  /** False until the player has answered the join prompt; while false every category is treated as off. */
  answered: boolean;
  /** Towns, docks, and the plain support-ring tiles around a grown town. */
  towns: boolean;
  /** FARM and FISH tiles. */
  food: boolean;
  /** Every other resource tile (titanium, gems, umbrite). */
  resources: boolean;
};

/** Legacy players, AI, and anyone loaded without a stored value: everything on, prompt never shown. */
export const DEFAULT_AUTO_SETTLE_PREFS: Readonly<AutoSettlePrefs> = {
  answered: true,
  towns: true,
  food: true,
  resources: true
};

/** A brand-new human: nothing auto-settles until they answer the join prompt. */
export const NEW_PLAYER_AUTO_SETTLE_PREFS: Readonly<AutoSettlePrefs> = {
  answered: false,
  towns: false,
  food: false,
  resources: false
};

export const autoSettleCategoryForTile = (tile: {
  town?: unknown;
  dockId?: string | undefined;
  resource?: string | undefined;
}): AutoSettleCategory => {
  if (tile.town || tile.dockId) return "towns";
  if (tile.resource === "FARM" || tile.resource === "FISH") return "food";
  if (tile.resource) return "resources";
  return "towns"; // plain support tile: follows the town setting
};

export const isAutoSettleAllowed = (
  prefs: Pick<AutoSettlePrefs, AutoSettleCategory>,
  category: AutoSettleCategory
): boolean => prefs[category];

export const isAutoSettleAllowedForTile = (
  prefs: Pick<AutoSettlePrefs, AutoSettleCategory>,
  tile: Parameters<typeof autoSettleCategoryForTile>[0]
): boolean => isAutoSettleAllowed(prefs, autoSettleCategoryForTile(tile));

export const isAutoSettlePrefsValue = (value: unknown): value is Pick<AutoSettlePrefs, AutoSettleCategory> => {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.towns === "boolean" && typeof v.food === "boolean" && typeof v.resources === "boolean";
};

/** Reads a persisted/wire value defensively; missing or malformed falls back to legacy defaults. */
export const normalizeAutoSettlePrefs = (value: unknown): AutoSettlePrefs => {
  if (!isAutoSettlePrefsValue(value)) return { ...DEFAULT_AUTO_SETTLE_PREFS };
  const answered = (value as { answered?: unknown }).answered;
  return { answered: answered === false ? false : true, towns: value.towns, food: value.food, resources: value.resources };
};
