// Per-player, per-category opt-in for the server's auto-settle (spends
// SETTLE_MANPOWER_COST on eligible FRONTIER tiles without a click). Shared by
// apps/simulation (the gate) and packages/client (the join prompt + settings),
// so both agree on which category a tile belongs to.
export type AutoSettleCategory = "towns" | "food" | "strategic" | "luxury";

export const AUTO_SETTLE_CATEGORIES: readonly AutoSettleCategory[] = ["towns", "food", "strategic", "luxury"];

export type AutoSettlePrefs = {
  /** False until the player has answered the join prompt; while false every category is treated as off. */
  answered: boolean;
  /** Towns, docks, and the plain support-ring tiles around a grown town. */
  towns: boolean;
  /** FARM and FISH tiles. */
  food: boolean;
  /** Strategic materials: TITANIUM, UMBRITE and GEMS (crystal). */
  strategic: boolean;
  /** Luxury resources: every other non-food resource tile (the network resources). */
  luxury: boolean;
};

/** Legacy players, AI, and anyone loaded without a stored value: everything on, prompt never shown. */
export const DEFAULT_AUTO_SETTLE_PREFS: Readonly<AutoSettlePrefs> = {
  answered: true,
  towns: true,
  food: true,
  strategic: true,
  luxury: true
};

/** A brand-new human: nothing auto-settles until they answer the join prompt. */
export const NEW_PLAYER_AUTO_SETTLE_PREFS: Readonly<AutoSettlePrefs> = {
  answered: false,
  towns: false,
  food: false,
  strategic: false,
  luxury: false
};

export const autoSettleCategoryForTile = (tile: {
  town?: unknown;
  dockId?: string | undefined;
  resource?: string | undefined;
}): AutoSettleCategory => {
  if (tile.town || tile.dockId) return "towns";
  if (tile.resource === "FARM" || tile.resource === "FISH") return "food";
  if (tile.resource === "TITANIUM" || tile.resource === "UMBRITE" || tile.resource === "GEMS") return "strategic";
  if (tile.resource) return "luxury";
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

/**
 * Reads the per-category switches from a wire/persisted value. Values stored before the strategic/luxury
 * split carry a single `resources` switch, which applies to both halves. Undefined when malformed.
 */
export const parseAutoSettleCategoryPrefs = (value: unknown): Pick<AutoSettlePrefs, AutoSettleCategory> | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const v = value as Record<string, unknown>;
  if (typeof v.towns !== "boolean" || typeof v.food !== "boolean") return undefined;
  if (typeof v.strategic === "boolean" && typeof v.luxury === "boolean") {
    return { towns: v.towns, food: v.food, strategic: v.strategic, luxury: v.luxury };
  }
  if (typeof v.resources === "boolean") return { towns: v.towns, food: v.food, strategic: v.resources, luxury: v.resources };
  return undefined;
};

/** Reads a persisted/wire value defensively; missing or malformed falls back to legacy defaults. */
export const normalizeAutoSettlePrefs = (value: unknown): AutoSettlePrefs => {
  const categories = parseAutoSettleCategoryPrefs(value);
  if (!categories) return { ...DEFAULT_AUTO_SETTLE_PREFS };
  const answered = (value as { answered?: unknown }).answered;
  return { answered: answered === false ? false : true, ...categories };
};
