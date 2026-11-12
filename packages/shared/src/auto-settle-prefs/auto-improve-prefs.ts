// Per-player, per-resource opt-in for the server's auto-improve: once a tile
// of a switched-on resource is garrisoned, the simulation builds that
// resource's improvement on it (same cost, slot and tech rules as a manual
// build). Stored with the auto-garrison prefs (auto-settle-prefs.ts) so it
// persists and reaches the client the same way.
import { RESOURCE_NETWORKS } from "../resource-networks/resource-networks.js";
import type { BuildableStructureType } from "../structure-costs/structure-costs.js";

/** The improvement each resource takes. Fish has none. */
export const AUTO_IMPROVE_STRUCTURE_BY_RESOURCE = {
  FARM: "HYDROGARDEN",
  TITANIUM: "MINE",
  UMBRITE: "UMBRITE_RIG",
  GEMS: "MINE",
  LUXURY_BIOTA: RESOURCE_NETWORKS.LUXURY_BIOTA.building,
  PRECURSOR_SALVAGE: RESOURCE_NETWORKS.PRECURSOR_SALVAGE.building
} as const satisfies Record<string, BuildableStructureType>;

export type AutoImproveResource = keyof typeof AUTO_IMPROVE_STRUCTURE_BY_RESOURCE;

export const AUTO_IMPROVE_RESOURCES = Object.keys(AUTO_IMPROVE_STRUCTURE_BY_RESOURCE) as AutoImproveResource[];

export type AutoImprovePrefs = Record<AutoImproveResource, boolean>;

/** Everyone starts with auto-improve off (AI included: its planner builds for itself). */
export const NO_AUTO_IMPROVE: Readonly<AutoImprovePrefs> = Object.fromEntries(
  AUTO_IMPROVE_RESOURCES.map((resource) => [resource, false])
) as AutoImprovePrefs;

export const isAutoImproveResource = (value: string | undefined): value is AutoImproveResource =>
  value !== undefined && Object.prototype.hasOwnProperty.call(AUTO_IMPROVE_STRUCTURE_BY_RESOURCE, value);

/** The improvement auto-improve would build on a tile of this resource, if any. */
export const autoImproveStructureForResource = (resource: string | undefined): BuildableStructureType | undefined =>
  isAutoImproveResource(resource) ? AUTO_IMPROVE_STRUCTURE_BY_RESOURCE[resource] : undefined;

/** Only the switches a value names; undefined when it isn't an object or a named value isn't boolean. */
export const parseAutoImprovePrefsPatch = (value: unknown): Partial<AutoImprovePrefs> | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const v = value as Record<string, unknown>;
  const patch: Partial<AutoImprovePrefs> = {};
  for (const resource of AUTO_IMPROVE_RESOURCES) {
    const on = v[resource];
    if (on === undefined) continue;
    if (typeof on !== "boolean") return undefined;
    patch[resource] = on;
  }
  return patch;
};

/** Reads a persisted value: a missing resource is off; undefined when not an object or a value isn't boolean. */
export const parseAutoImprovePrefs = (value: unknown): AutoImprovePrefs | undefined => {
  const patch = parseAutoImprovePrefsPatch(value);
  return patch ? { ...NO_AUTO_IMPROVE, ...patch } : undefined;
};
