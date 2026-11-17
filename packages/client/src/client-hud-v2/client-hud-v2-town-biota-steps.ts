// What an unruly town's owner can do next about luxury biota, from what the
// client knows: the charter tech, your own biota sites and Estates, and the
// deposits you have seen. The town screen shows these under its biota row.

import { BIOTA_SLOTS_PER_SITE, RESOURCE_NETWORKS } from "@border-empires/shared";
import type { Tile } from "../client-types.js";

export type BiotaStep =
  | { kind: "research"; techId: string; techName: string }
  /** Every slot you have already goes to a town held longer. */
  | { kind: "taken"; slots: number }
  /** build: your garrisoned site, charter researched. owned: the same site before the charter. */
  | { kind: "build" | "owned" | "garrison" | "building" | "capture"; x: number; y: number }
  /** search: no biota deposit seen yet. more: only your developed sites, which aren't enough. */
  | { kind: "search" | "more" };

export type BiotaStepInput = {
  me: string;
  tiles: Iterable<Tile>;
  techIds: readonly string[];
  /** Tech names for the charter (state.techCatalog); falls back to the id. */
  techName?: string | undefined;
  /** Developed biota sites after trades (resourceSlots.bonusSupply.supply.LUXURY_BIOTA). */
  supplySites: number;
  /** The town, to pick the nearest site. */
  from: { x: number; y: number };
  worldWidth: number;
};

const { building: ESTATE, tech: CHARTER } = RESOURCE_NETWORKS.LUXURY_BIOTA;

export const biotaSteps = (input: BiotaStepInput): BiotaStep[] => {
  const steps: BiotaStep[] = [];
  const hasCharter = input.techIds.includes(CHARTER);
  if (!hasCharter) steps.push({ kind: "research", techId: CHARTER, techName: input.techName ?? CHARTER });
  if (input.supplySites > 0) steps.push({ kind: "taken", slots: input.supplySites * BIOTA_SLOTS_PER_SITE });
  const distance = (t: Tile): number => {
    const dx = Math.abs(t.x - input.from.x);
    return Math.max(Math.min(dx, input.worldWidth - dx), Math.abs(t.y - input.from.y));
  };
  let idle: Tile | undefined;
  let building: Tile | undefined;
  let seen: Tile | undefined;
  let ownsAny = false;
  for (const tile of input.tiles) {
    if (tile.resource !== "LUXURY_BIOTA") continue;
    if (tile.ownerId === input.me) {
      ownsAny = true;
      const estate = tile.economicStructure?.type === ESTATE ? tile.economicStructure : undefined;
      if (!estate) { if (!idle || distance(tile) < distance(idle)) idle = tile; }
      else if (estate.status === "under_construction" && (!building || distance(tile) < distance(building))) building = tile;
    } else if (!seen || distance(tile) < distance(seen)) seen = tile;
  }
  // One place to go: your own idle site first, then an Estate going up, then the nearest seen deposit.
  if (idle) steps.push({ kind: idle.ownershipState !== "SETTLED" ? "garrison" : hasCharter ? "build" : "owned", x: idle.x, y: idle.y });
  else if (building) steps.push({ kind: "building", x: building.x, y: building.y });
  else if (seen) steps.push({ kind: "capture", x: seen.x, y: seen.y });
  else steps.push({ kind: ownsAny ? "more" : "search" });
  return steps;
};
