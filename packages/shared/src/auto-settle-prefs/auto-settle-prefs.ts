// Per-player opt-in for the server's auto-settle (spends SETTLE_MANPOWER_COST
// on eligible FRONTIER tiles without a click): one switch for towns/docks and
// one per resource type. Shared by apps/simulation (the gate) and
// packages/client (the join prompt + settings), so both agree on which switch
// a tile belongs to.
import { NETWORK_RESOURCES } from "../resource-networks/resource-networks.js";
import type { ResourceType } from "../types.js";

/** Every resource a tile can carry, in settings-panel order: food, strategic, then the network resources. */
export const AUTO_SETTLE_RESOURCES: readonly ResourceType[] = ["FARM", "FISH", "TITANIUM", "UMBRITE", "GEMS", ...NETWORK_RESOURCES];

export type AutoSettleCategory = "towns" | ResourceType;

export const AUTO_SETTLE_CATEGORIES: readonly AutoSettleCategory[] = ["towns", ...AUTO_SETTLE_RESOURCES];

export type AutoSettleCategoryPrefs = Record<AutoSettleCategory, boolean>;

/**
 * `towns` covers towns, docks, and the plain support-ring tiles around a grown town; every other key is
 * that resource's tiles (e.g. TITANIUM only, PRECURSOR_SALVAGE only).
 */
export type AutoSettlePrefs = AutoSettleCategoryPrefs & {
  /** False until the player has answered the join prompt; while false every category is treated as off. */
  answered: boolean;
};

const allCategories = (on: boolean): AutoSettleCategoryPrefs =>
  Object.fromEntries(AUTO_SETTLE_CATEGORIES.map((category) => [category, on])) as AutoSettleCategoryPrefs;

/** Legacy players, AI, and anyone loaded without a stored value: everything on, prompt never shown. */
export const DEFAULT_AUTO_SETTLE_PREFS: Readonly<AutoSettlePrefs> = { answered: true, ...allCategories(true) };

/** A brand-new human: nothing auto-settles until they answer the join prompt. */
export const NEW_PLAYER_AUTO_SETTLE_PREFS: Readonly<AutoSettlePrefs> = { answered: false, ...allCategories(false) };

const isAutoSettleResource = (value: string): value is ResourceType => (AUTO_SETTLE_RESOURCES as readonly string[]).includes(value);

export const autoSettleCategoryForTile = (tile: {
  town?: unknown;
  dockId?: string | undefined;
  resource?: string | undefined;
}): AutoSettleCategory => {
  if (tile.town || tile.dockId) return "towns";
  if (tile.resource && isAutoSettleResource(tile.resource)) return tile.resource;
  return "towns"; // plain support tile: follows the town setting
};

export const isAutoSettleAllowed = (prefs: AutoSettleCategoryPrefs, category: AutoSettleCategory): boolean => prefs[category];

export const isAutoSettleAllowedForTile = (
  prefs: AutoSettleCategoryPrefs,
  tile: Parameters<typeof autoSettleCategoryForTile>[0]
): boolean => isAutoSettleAllowed(prefs, autoSettleCategoryForTile(tile));

/** The grouped switch a resource fell under before the per-resource split. */
const legacyGroupSwitch = (v: Record<string, unknown>, resource: ResourceType): unknown => {
  if (resource === "FARM" || resource === "FISH") return v.food;
  const group = resource === "TITANIUM" || resource === "UMBRITE" || resource === "GEMS" ? v.strategic : v.luxury;
  return typeof group === "boolean" ? group : v.resources;
};

/**
 * Reads the per-category switches from a wire/persisted value. A resource without its own switch takes the
 * grouped one it was stored under before the per-resource split (`food`; `strategic`/`luxury`; or, before
 * that split, a single `resources`). Undefined when malformed.
 */
export const parseAutoSettleCategoryPrefs = (value: unknown): AutoSettleCategoryPrefs | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const v = value as Record<string, unknown>;
  if (typeof v.towns !== "boolean") return undefined;
  const prefs = { towns: v.towns } as AutoSettleCategoryPrefs;
  for (const resource of AUTO_SETTLE_RESOURCES) {
    const own = v[resource];
    const on = typeof own === "boolean" ? own : legacyGroupSwitch(v, resource);
    if (typeof on !== "boolean") return undefined;
    prefs[resource] = on;
  }
  return prefs;
};

/** Reads a persisted/wire value defensively; missing or malformed falls back to legacy defaults. */
export const normalizeAutoSettlePrefs = (value: unknown): AutoSettlePrefs => {
  const categories = parseAutoSettleCategoryPrefs(value);
  if (!categories) return { ...DEFAULT_AUTO_SETTLE_PREFS };
  const answered = (value as { answered?: unknown }).answered;
  return { answered: answered === false ? false : true, ...categories };
};

const LEGACY_GROUP_SWITCHES = ["food", "strategic", "luxury", "resources"] as const;

/** The gateway's sim payload for SET_AUTO_SETTLE_PREFS: every category switch plus any legacy grouped ones an older tab sent. */
export const autoSettlePrefsCommandPayload = (message: Partial<Record<string, unknown>>): Record<string, boolean> => {
  const payload: Record<string, boolean> = {};
  for (const key of [...AUTO_SETTLE_CATEGORIES, ...LEGACY_GROUP_SWITCHES]) {
    const value = message[key];
    if (typeof value === "boolean") payload[key] = value;
  }
  return payload;
};
