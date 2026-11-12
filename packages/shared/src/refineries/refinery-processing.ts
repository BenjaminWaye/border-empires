// Which refineries work and which deposit tiles they process
// (docs/territory-development-plan.md, Phase 2). Pure over a tile map: the
// simulation calls this where it computes slot supply and when it projects a
// refinery's status onto the wire. Nothing here is cached or persisted.
//
// A refinery works only while: it is active; its tile is SETTLED land held by
// the refinery's owner; that tile sits on the support ring of a town the same
// player holds (the caller's resolver); it has a field; it wins that field
// (one refinery per field per owner, oldest assignment first); and the field
// is linked to the town. A working refinery adds REFINERY_SLOTS_PER_TILE to
// every SETTLED field tile its owner holds, plus
// REFINERY_BOOSTER_SLOTS_PER_TILE while an active booster of its resource
// stands on that town's ring.
import { supportRingCandidates } from "../town-growth/town-support-ring.js";
import { supportRingRadiusForTier } from "../town-growth/town-growth.js";
import type { PopulationTier } from "../types.js";
import {
  compareRefineryTiles, refineryFieldAt, refineryFieldLinked, refineryNeighborKeys, refineryReachFromTownKey, refineryTileKey,
  type RefineryField
} from "./refinery-fields.js";
import {
  REFINERY_BOOSTER_SLOTS_PER_TILE, REFINERY_BOOSTER_TYPE_BY_RESOURCE, REFINERY_FIELD_RESOURCE_BY_TYPE, REFINERY_SLOTS_PER_TILE,
  isRefineryType,
  type RefineryBoosterType, type RefineryFieldAssignment, type RefineryFieldResource, type RefineryTile, type RefineryTownResolver,
  type RefineryType, type RefineryWireStatus
} from "./refinery-types.js";

export type RefineryUnassignedReason = "NO_FIELD" | "FIELD_LOST" | "FIELD_TAKEN";

export type RefineryEvaluation = {
  key: string;
  x: number;
  y: number;
  type: RefineryType;
  ownerId: string;
  resource: RefineryFieldResource;
  /** The field it holds after re-anchoring; undefined while unassigned. */
  field?: RefineryField;
  /** The effective anchor (the stored one, or another owned tile of the same field). */
  anchor?: { x: number; y: number };
  unassignedReason?: RefineryUnassignedReason;
  townKey?: string;
  linked: boolean;
  working: boolean;
  boosted: boolean;
  /** SETTLED field tiles the owner holds that this refinery adds slots to (empty unless working). */
  processedTileKeys: string[];
};

const heldBy = (tile: RefineryTile, ownerId: string): boolean =>
  tile.ownerId === ownerId && (tile.ownershipState === "FRONTIER" || tile.ownershipState === "SETTLED");

/**
 * The field an assignment points at now. The anchor stays when it is still a
 * matching deposit the owner holds; otherwise another owned tile of the same
 * component takes over (or, if the anchor itself stopped being a deposit, of
 * a component next to it). Undefined when no owned tile is left.
 */
export const effectiveRefineryField = <T extends RefineryTile>(
  tiles: ReadonlyMap<string, T>, ownerId: string, assignment: RefineryFieldAssignment, resource: RefineryFieldResource
): { field: RefineryField; anchor: { x: number; y: number } } | undefined => {
  const anchorTile = tiles.get(refineryTileKey(assignment.x, assignment.y));
  const seeds = anchorTile?.resource === resource
    ? [anchorTile]
    : refineryNeighborKeys(assignment.x, assignment.y).map((key) => tiles.get(key))
      .filter((tile): tile is T => tile?.resource === resource).sort(compareRefineryTiles);
  const seen = new Set<string>();
  for (const seed of seeds) {
    if (seen.has(refineryTileKey(seed.x, seed.y))) continue;
    const field = refineryFieldAt(tiles, seed.x, seed.y, resource);
    if (!field) continue;
    for (const key of field.keys) seen.add(key);
    if (anchorTile && anchorTile === seed && heldBy(anchorTile, ownerId)) return { field, anchor: { x: anchorTile.x, y: anchorTile.y } };
    const owned = field.tiles.find((tile) => heldBy(tile, ownerId));
    if (owned) return { field, anchor: { x: owned.x, y: owned.y } };
  }
  return undefined;
};

/** True when an active booster of this type stands on the town's ring for the same owner. */
export const townHasActiveRefineryBooster = <T extends RefineryTile>(
  tiles: ReadonlyMap<string, T>, ownerId: string, townKey: string, boosterType: RefineryBoosterType, resolveTown: RefineryTownResolver
): boolean => {
  const town = tiles.get(townKey);
  if (!town) return false;
  const radius = supportRingRadiusForTier(town.town?.populationTier as PopulationTier | undefined);
  for (const { tile } of supportRingCandidates(tiles, town.x, town.y, radius)) {
    const record = tile.economicStructure;
    if (record?.type !== boosterType || record.ownerId !== ownerId || record.status !== "active") continue;
    if (tile.ownerId !== ownerId || tile.ownershipState !== "SETTLED") continue;
    if (resolveTown(ownerId, tile.x, tile.y) === townKey) return true;
  }
  return false;
};

type Candidate = { tile: RefineryTile; type: RefineryType; ownerId: string; assignedAt: number; resolved: ReturnType<typeof effectiveRefineryField> };

/**
 * Evaluates every refinery among `refineryTiles` (other tiles are ignored).
 * Exclusivity is decided among the refineries passed in, so callers pass at
 * least every refinery of the owners they care about that could hold the same
 * field (the owner's settled tiles, or a local scan; see refineryRivalTiles).
 */
export const evaluateRefineries = <T extends RefineryTile>(
  tiles: ReadonlyMap<string, T>, refineryTiles: Iterable<RefineryTile>, resolveTown: RefineryTownResolver
): Map<string, RefineryEvaluation> => {
  const candidates: Candidate[] = [];
  for (const tile of refineryTiles) {
    const record = tile.economicStructure;
    if (!record || !isRefineryType(record.type)) continue;
    const resource = REFINERY_FIELD_RESOURCE_BY_TYPE[record.type];
    const resolved = record.refineryField ? effectiveRefineryField(tiles, record.ownerId, record.refineryField, resource) : undefined;
    candidates.push({ tile, type: record.type, ownerId: record.ownerId, assignedAt: record.refineryField?.assignedAt ?? 0, resolved });
  }
  const winners = new Map<string, Candidate>();
  for (const candidate of candidates) {
    if (!candidate.resolved) continue;
    const groupKey = `${candidate.ownerId}|${candidate.resolved.field.resource}|${candidate.resolved.field.id}`;
    const current = winners.get(groupKey);
    if (!current || candidate.assignedAt < current.assignedAt ||
      (candidate.assignedAt === current.assignedAt && compareRefineryTiles(candidate.tile, current.tile) < 0)) winners.set(groupKey, candidate);
  }
  const winnerSet = new Set(winners.values());
  const result = new Map<string, RefineryEvaluation>();
  for (const candidate of candidates) {
    const evaluation = evaluateCandidate(tiles, candidate, winnerSet.has(candidate), resolveTown);
    result.set(evaluation.key, evaluation);
  }
  return result;
};

const evaluateCandidate = <T extends RefineryTile>(
  tiles: ReadonlyMap<string, T>, candidate: Candidate, wins: boolean, resolveTown: RefineryTownResolver
): RefineryEvaluation => {
  const { tile, type, ownerId } = candidate;
  const record = tile.economicStructure!;
  const base: RefineryEvaluation = {
    key: refineryTileKey(tile.x, tile.y), x: tile.x, y: tile.y, type, ownerId,
    resource: REFINERY_FIELD_RESOURCE_BY_TYPE[type], linked: false, working: false, boosted: false, processedTileKeys: []
  };
  const tileHeld = tile.ownerId === ownerId && tile.ownershipState === "SETTLED";
  const townKey = tileHeld ? resolveTown(ownerId, tile.x, tile.y) : undefined;
  if (townKey) base.townKey = townKey;
  if (!candidate.resolved) {
    base.unassignedReason = record.refineryField ? "FIELD_LOST" : "NO_FIELD";
    return base;
  }
  if (!wins) {
    base.unassignedReason = "FIELD_TAKEN";
    return base;
  }
  const { field, anchor } = candidate.resolved;
  base.field = field;
  base.anchor = anchor;
  base.linked = townKey !== undefined && refineryFieldLinked(tiles, ownerId, townKey, field, refineryReachFromTownKey(tiles, ownerId, townKey));
  base.working = base.linked && record.status === "active";
  if (!base.working || !townKey) return base;
  base.processedTileKeys = field.tiles
    .filter((fieldTile) => fieldTile.ownerId === ownerId && fieldTile.ownershipState === "SETTLED")
    .map((fieldTile) => refineryTileKey(fieldTile.x, fieldTile.y));
  base.boosted = townHasActiveRefineryBooster(tiles, ownerId, townKey, REFINERY_BOOSTER_TYPE_BY_RESOURCE[base.resource], resolveTown);
  return base;
};

export type RefinerySlotBonus = { sourceId: RefineryType | RefineryBoosterType; slots: number };

/** Per processed tile key, the slots each working refinery (and its booster) adds, labelled for the HUD breakdown. */
export const refinerySlotBonusesByTile = (evaluations: Iterable<RefineryEvaluation>): Map<string, RefinerySlotBonus[]> => {
  const bonuses = new Map<string, RefinerySlotBonus[]>();
  for (const evaluation of evaluations) {
    if (!evaluation.working) continue;
    for (const key of evaluation.processedTileKeys) {
      const list = bonuses.get(key) ?? [];
      list.push({ sourceId: evaluation.type, slots: REFINERY_SLOTS_PER_TILE });
      if (evaluation.boosted) {
        list.push({ sourceId: REFINERY_BOOSTER_TYPE_BY_RESOURCE[evaluation.resource], slots: REFINERY_BOOSTER_SLOTS_PER_TILE });
      }
      bonuses.set(key, list);
    }
  }
  return bonuses;
};

/** The derived status a viewer gets on the refinery's JSON: full for its owner, `linked` only for others. */
export const refineryWireStatus = (evaluation: RefineryEvaluation, viewerIsOwner: boolean): RefineryWireStatus => {
  if (!viewerIsOwner) return { linked: evaluation.linked };
  if (!evaluation.anchor) return { unassigned: true };
  return { fieldX: evaluation.anchor.x, fieldY: evaluation.anchor.y, linked: evaluation.linked, processedTiles: evaluation.processedTileKeys.length };
};
