import type { ResourceType } from "./types.js";

// Single source of truth for Retort Transmutation's resource-class grouping,
// shared by the client's target-picker (client-tile-action-logic.ts) and the
// server's RETORT_RECAST handler so "recasting a tile into its own class"
// (e.g. FISH -> FARM, both "food") is rejected identically on both sides.
export type RetortTargetResource = "FARM" | "TITANIUM" | "GEMS" | "UMBRITE";
export type RetortResourceClass = "food" | "titanium" | "crystal" | "umbrite";

export const retortResourceClassForTile = (resource: ResourceType | undefined): RetortResourceClass | undefined => {
  if (resource === "FARM" || resource === "FISH") return "food";
  if (resource === "TITANIUM") return "titanium";
  if (resource === "GEMS") return "crystal";
  if (resource === "UMBRITE") return "umbrite";
  return undefined;
};

export const retortResourceClassForTarget = (target: RetortTargetResource): RetortResourceClass => {
  if (target === "FARM") return "food";
  if (target === "TITANIUM") return "titanium";
  if (target === "GEMS") return "crystal";
  return "umbrite";
};
