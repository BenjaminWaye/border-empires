// What an unruly town's owner can do next about luxury biota, from what the
// client knows: the charter tech, your own biota sites and Estates, and the
// deposits you have seen. The town screen shows these under its biota row.

import { RESOURCE_NETWORKS, wrappedChebyshevDistance } from "@border-empires/shared";
import type { Tile } from "../client-types.js";

export type BiotaStep =
  | { kind: "research"; techId: string; techName: string }
  /** Slots your towns held longer received (they are supplied first). */
  | { kind: "taken"; slots: number }
  /** build: your garrisoned site, charter researched. owned: the same site before the charter. inactive: an Estate switched off or being removed. */
  | { kind: "build" | "owned" | "garrison" | "inactive" | "building" | "capture"; x: number; y: number }
  /** search: no biota deposit seen yet. more: only your developed sites, which aren't enough. */
  | { kind: "search" | "more" };

export type BiotaStepInput = {
  me: string;
  tiles: Iterable<Tile>;
  techIds: readonly string[];
  /** Tech names for the charter (state.techCatalog); falls back to the id. */
  techName?: string | undefined;
  /** Biota slots your other towns received (sum of ManpowerBreakdown.biotaTowns[].received, this town excluded). */
  otherTownsSlots: number;
  /** The town, to pick the nearest site (wrapped distance). */
  from: { x: number; y: number };
};

const { building: ESTATE, tech: CHARTER } = RESOURCE_NETWORKS.LUXURY_BIOTA;

export const biotaSteps = (input: BiotaStepInput): BiotaStep[] => {
  const steps: BiotaStep[] = [];
  const hasCharter = input.techIds.includes(CHARTER);
  if (!hasCharter) steps.push({ kind: "research", techId: CHARTER, techName: input.techName ?? CHARTER });
  if (input.otherTownsSlots > 0) steps.push({ kind: "taken", slots: input.otherTownsSlots });
  const distance = (t: Tile): number => wrappedChebyshevDistance(t.x, t.y, input.from.x, input.from.y);
  const nearer = (t: Tile, best: Tile | undefined): boolean => !best || distance(t) < distance(best);
  let idle: Tile | undefined;
  let inactive: Tile | undefined;
  let building: Tile | undefined;
  let seen: Tile | undefined;
  let ownsAny = false;
  for (const tile of input.tiles) {
    if (tile.resource !== "LUXURY_BIOTA") continue;
    if (tile.ownerId === input.me) {
      ownsAny = true;
      const estate = tile.economicStructure?.type === ESTATE ? tile.economicStructure : undefined;
      if (!estate) { if (nearer(tile, idle)) idle = tile; }
      else if (estate.status === "under_construction") { if (nearer(tile, building)) building = tile; }
      else if (estate.status !== "active" && nearer(tile, inactive)) inactive = tile;
    } else if (nearer(tile, seen)) seen = tile;
  }
  // One place to go: your own idle site first, then a switched-off Estate, then one going up, then the nearest seen deposit.
  if (idle) steps.push({ kind: idle.ownershipState !== "SETTLED" ? "garrison" : hasCharter ? "build" : "owned", x: idle.x, y: idle.y });
  else if (inactive) steps.push({ kind: "inactive", x: inactive.x, y: inactive.y });
  else if (building) steps.push({ kind: "building", x: building.x, y: building.y });
  else if (seen) steps.push({ kind: "capture", x: seen.x, y: seen.y });
  else steps.push({ kind: ownsAny ? "more" : "search" });
  return steps;
};
