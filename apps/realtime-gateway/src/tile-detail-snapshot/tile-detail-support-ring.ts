// Support-ring helpers split out of tile-detail-snapshot.ts to keep that file
// under the repo's 500-line cap. These back the gateway's fallback/estimated
// tile-detail path (no supportTileBelongsToTown assignment — see that file's
// own comments for why this path is simpler than the authoritative
// apps/simulation/src/economy-network/economy-network-support-ring.ts one).
import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";
import {
  CONVERTER_TOWN_MODIFIER_AGGREGATE_TYPES,
  converterExchangeGoldPerMinute,
  TOWN_MODIFIER_AGGREGATE_TYPES,
  type ModifierStructureType
} from "@border-empires/game-domain";
import { supportRingCandidates, supportRingRadiusForTier } from "@border-empires/shared";

type SnapshotTile = PlayerSubscriptionSnapshot["tiles"][number];

const keyFor = (x: number, y: number): string => `${x},${y}`;

const parseStructure = <T>(value?: string): T | undefined => {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
};

export const ringNeighbors = (
  tilesByKey: ReadonlyMap<string, SnapshotTile>,
  x: number,
  y: number
): SnapshotTile[] => {
  const radius = supportRingRadiusForTier(tilesByKey.get(keyFor(x, y))?.townPopulationTier);
  return supportRingCandidates(tilesByKey, x, y, radius).map(({ tile }) => tile);
};

export const supportSummaryForTown = (
  tilesByKey: ReadonlyMap<string, SnapshotTile>,
  ownerId: string,
  x: number,
  y: number
): { supportCurrent: number; supportMax: number } => {
  let supportCurrent = 0;
  let supportMax = 0;
  for (const neighbor of ringNeighbors(tilesByKey, x, y)) {
    if (neighbor.terrain !== "LAND" || neighbor.dockId) continue;
    supportMax += 1;
    if (neighbor.ownerId === ownerId && neighbor.ownershipState === "SETTLED") supportCurrent += 1;
  }
  return { supportCurrent, supportMax };
};

const TOWN_MODIFIER_AGGREGATE_TYPE_SET = new Set<string>(TOWN_MODIFIER_AGGREGATE_TYPES);
const CONVERTER_TOWN_MODIFIER_TYPE_SET = new Set<string>(CONVERTER_TOWN_MODIFIER_AGGREGATE_TYPES);

export const derivedTownSupportStructures = (
  tilesByKey: ReadonlyMap<string, SnapshotTile>,
  ownerId: string,
  x: number,
  y: number
): {
  hasMintworks: boolean;
  mintworksCount: number;
  hasGranary: boolean;
  clearingHouseActive: boolean;
  // Mintworks-style attribution: gold/minute from active EXCHANGE-mode
  // converters (Aether Condenser/Titanium Works/Umbrite Works) in the
  // support ring — see fallbackTownGoldPerMinute's matching param.
  converterGoldPerMinute: number;
  // Unified building modifier display (stage 2): per-type counts for every
  // TOWN_MODIFIER_AGGREGATE_TYPES member found in the support ring, fed
  // into game-domain's townModifierTotalsFromCounts below — the single
  // source of truth for the aggregation math itself, shared with
  // apps/simulation/src/live-town-summary.ts so the two paths can't drift
  // apart again the way they did the first time (this path never computed
  // townModifierTotals at all, so it never reached the tile popup). For the
  // converter types, this count is EXCHANGE-mode-filtered (a Refine-mode
  // converter earns no gold and shouldn't show a "Sell Off gold" line).
  aggregateCounts: Partial<Record<ModifierStructureType, number>>;
} => {
  let mintworksCount = 0;
  let hasGranary = false;
  // mintworks-stacking task: no town-level Clearing House signal previously
  // existed on this fallback path — detected here the same support-ring way
  // Mintworks/Granary already are, rather than left permanently false.
  let clearingHouseActive = false;
  let converterGoldPerMinute = 0;
  const aggregateCounts: Partial<Record<ModifierStructureType, number>> = {};
  // Several TOWN_MODIFIER_AGGREGATE_TYPES members (Mintworks, Garrison Hall,
  // Weapons Workshop, Titanium/Umbrite Weapons Factory, Titanium/Umbrite
  // Works, Clearing House, Logistics Guild) have "same_tile"/"town_support"
  // placementMode (structure-placement-metadata.json), meaning they can be
  // legally built directly on the town's own settled tile, not only on its
  // support-ring neighbors. Check the town's own tile first, then the ring,
  // using the exact same active/type logic for both.
  for (const candidate of [tilesByKey.get(keyFor(x, y)), ...ringNeighbors(tilesByKey, x, y)]) {
    if (!candidate || candidate.ownerId !== ownerId || candidate.ownershipState !== "SETTLED") continue;
    const structure = parseStructure<{ type?: string; status?: string; converterMode?: string }>(candidate.economicStructureJson);
    if (!structure || structure.status !== "active" || !structure.type) continue;
    if (structure.type === "MINTWORKS") mintworksCount += 1;
    if (structure.type === "GRANARY") hasGranary = true;
    if (structure.type === "CLEARING_HOUSE") clearingHouseActive = true;
    if (CONVERTER_TOWN_MODIFIER_TYPE_SET.has(structure.type)) {
      const amountPerMinute = converterExchangeGoldPerMinute(structure.type, structure.converterMode);
      if (amountPerMinute <= 0) continue;
      converterGoldPerMinute += amountPerMinute;
      const type = structure.type as ModifierStructureType;
      aggregateCounts[type] = (aggregateCounts[type] ?? 0) + 1;
    } else if (TOWN_MODIFIER_AGGREGATE_TYPE_SET.has(structure.type)) {
      const type = structure.type as ModifierStructureType;
      aggregateCounts[type] = (aggregateCounts[type] ?? 0) + 1;
    }
  }
  return { hasMintworks: mintworksCount > 0, mintworksCount, hasGranary, clearingHouseActive, converterGoldPerMinute, aggregateCounts };
};

export const derivedTownIsFed = (
  tilesByKey: ReadonlyMap<string, SnapshotTile>,
  ownerId: string,
  x: number,
  y: number
): boolean => {
  for (const neighbor of ringNeighbors(tilesByKey, x, y)) {
    if (neighbor.ownerId !== ownerId || neighbor.ownershipState !== "SETTLED") continue;
    if (neighbor.resource === "FARM" || neighbor.resource === "FISH") return true;
  }
  return false;
};
