// Per-player opt-in for the server's auto-settle (spends SETTLE_MANPOWER_COST
// on eligible FRONTIER tiles without a click): one switch for towns/docks and
// one per resource type. Shared by apps/simulation (the gate) and
// packages/client (the join prompt + settings), so both agree on which switch
// a tile belongs to.
import { NETWORK_RESOURCES } from "../resource-networks/resource-networks.js";
import type { ResourceType } from "../types.js";
import { NO_AUTO_IMPROVE, parseAutoImprovePrefs, parseAutoImprovePrefsPatch, type AutoImprovePrefs } from "./auto-improve-prefs.js";

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
  /** Auto-improve switches (auto-improve-prefs.ts): build the resource's improvement once its tile is garrisoned. */
  improve: AutoImprovePrefs;
};

const allCategories = (on: boolean): AutoSettleCategoryPrefs =>
  Object.fromEntries(AUTO_SETTLE_CATEGORIES.map((category) => [category, on])) as AutoSettleCategoryPrefs;

/** Legacy players, AI, and anyone loaded without a stored value: everything on, prompt never shown. */
export const DEFAULT_AUTO_SETTLE_PREFS: Readonly<AutoSettlePrefs> = { answered: true, ...allCategories(true), improve: { ...NO_AUTO_IMPROVE } };

/** A brand-new human: nothing auto-settles until they answer the join prompt. */
export const NEW_PLAYER_AUTO_SETTLE_PREFS: Readonly<AutoSettlePrefs> = { answered: false, ...allCategories(false), improve: { ...NO_AUTO_IMPROVE } };

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

/**
 * Reads a persisted/wire value defensively; missing or malformed falls back to legacy defaults. Auto-improve
 * is off unless the value carries it (it postdates every stored value without it).
 */
export const normalizeAutoSettlePrefs = (value: unknown): AutoSettlePrefs => {
  const categories = parseAutoSettleCategoryPrefs(value);
  if (!categories) return { ...DEFAULT_AUTO_SETTLE_PREFS, improve: { ...NO_AUTO_IMPROVE } };
  const { answered, improve } = value as { answered?: unknown; improve?: unknown };
  return { answered: answered === false ? false : true, ...categories, improve: parseAutoImprovePrefs(improve) ?? { ...NO_AUTO_IMPROVE } };
};

const LEGACY_GROUP_SWITCHES = ["food", "strategic", "luxury", "resources"] as const;

/** The gateway's sim payload for SET_AUTO_SETTLE_PREFS: every category switch, any legacy grouped ones an older tab sent, and the auto-improve switches when sent. */
export const autoSettlePrefsCommandPayload = (message: Partial<Record<string, unknown>>): Record<string, boolean | Partial<AutoImprovePrefs>> => {
  const payload: Record<string, boolean> = {};
  for (const key of [...AUTO_SETTLE_CATEGORIES, ...LEGACY_GROUP_SWITCHES]) {
    const value = message[key];
    if (typeof value === "boolean") payload[key] = value;
  }
  // Forwarded as sent: the sim changes only the switches it names.
  const improve = parseAutoImprovePrefsPatch(message.improve);
  return improve ? { ...payload, improve } : payload;
};

const LEGACY_GROUP_MEMBERS = {
  food: ["FARM", "FISH"],
  strategic: ["TITANIUM", "UMBRITE", "GEMS"],
  luxury: AUTO_SETTLE_RESOURCES.filter((resource) => !["FARM", "FISH", "TITANIUM", "UMBRITE", "GEMS"].includes(resource))
} as const satisfies Record<string, readonly ResourceType[]>;

export type LegacyAutoSettleGroupSwitches = Record<keyof typeof LEGACY_GROUP_MEMBERS, boolean>;

/**
 * Prefs as persisted and sent to clients: the per-resource switches plus the grouped food/strategic/luxury
 * ones that readers from before the per-resource split require (a rolled-back sim, a tab still on the old
 * bundle). Without them those readers fall back to all-on and would garrison for a player who opted out,
 * so a group reads on only when every resource in it is on. Readers that know the per-resource keys
 * ignore the group ones (parseAutoSettleCategoryPrefs prefers a resource's own switch).
 */
export const autoSettlePrefsForOutput = (value: unknown): AutoSettlePrefs & LegacyAutoSettleGroupSwitches => {
  const prefs = normalizeAutoSettlePrefs(value);
  const group = (members: readonly ResourceType[]): boolean => members.every((resource) => prefs[resource]);
  return {
    ...prefs,
    food: group(LEGACY_GROUP_MEMBERS.food),
    strategic: group(LEGACY_GROUP_MEMBERS.strategic),
    luxury: group(LEGACY_GROUP_MEMBERS.luxury)
  };
};
