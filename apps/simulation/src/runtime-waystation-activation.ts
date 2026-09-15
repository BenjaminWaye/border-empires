import type { SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { WAYSTATION_POP_BURST, WAYSTATION_REVEAL_RADIUS, WAYSTATION_RESOURCE_SLOT_BONUS, WAYSTATION_VISION_TOWN_SEARCH_RADIUS } from "@border-empires/shared";
import { buildTechUpdatePayload, recomputeMods, techEntryById } from "./tech-domain-bridge/tech-domain-bridge.js";
import { grantAetherTowerUnlockIfLinked } from "./tech-domain-bridge/tech-aether-tower-unlock.js";
import type { SimulationTileWireDelta } from "./runtime-types.js";
import type { VisibilityCoverageTracker, VisibilityTransitionCallbacks } from "./visibility-coverage-cache.js";

export type WaystationVisibilityCoverage = Pick<VisibilityCoverageTracker, "addTileVisionBonus">;

export type WaystationActivationInput = {
  now: () => number;
  tiles: Map<string, DomainTileState>;
  players: Map<string, DomainPlayer>;
  visibilityCoverage: WaystationVisibilityCoverage;
  visionTransitionCallbacks: VisibilityTransitionCallbacks;
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  emitEvent: (event: SimulationEvent) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  /** Injectable randomness for the one-of-four effect roll (and the tech/nothing tie-break within TECH). Defaults to Math.random; tests pass a deterministic stub. */
  random?: () => number;
};

type WaystationEffect = "VISION" | "POPULATION" | "TECH" | "RESOURCE_SLOT";

/** Effect roll order -- fixed and load-bearing for tests: 0=VISION, 1=POPULATION, 2=TECH, 3=RESOURCE_SLOT. */
const WAYSTATION_EFFECTS: readonly WaystationEffect[] = ["VISION", "POPULATION", "TECH", "RESOURCE_SLOT"];

const WAYSTATION_SLOT_RESOURCES = ["FOOD", "TITANIUM", "CRYSTAL", "UMBRITE"] as const;

/** The fixed reason tag for a waystation's permanent vision footprint -- see addTileVisionBonus/removeTileVisionBonus in visibility-coverage-cache.ts. */
const WAYSTATION_VISION_REASON = "waystation";

/**
 * Applies (or re-applies at boot) a waystation's permanent vision footprint
 * for the player who activated it. Idempotent per (playerId, x, y, radius,
 * reason) at the coverage-cache layer, so this is safe to call once per
 * already-activated waystation tile during boot's tile-scan pass (mirroring
 * seedOutpostVisionBonus/seedObservatoryVisionBonus in runtime.ts) to
 * reconstruct the bonus after every restart -- the coverage cache itself is
 * rebuilt from scratch on boot and has no persistence of its own, so without
 * this call every activated waystation's vision silently and permanently
 * vanishes on the next restart even though the tile stays `activated`
 * forever (its one-shot guard means the effect can never re-fire).
 *
 * Reads the revealed location from tile.waystation.revealedAtX/Y (recorded
 * at activation time) rather than recomputing "nearest town" from the
 * waystation's own x/y -- recomputing at boot could disagree with the
 * original activation-time computation if world state around it changed in
 * the interim (e.g. the town that grounded the reveal was later captured or
 * destroyed). Only fires for a waystation whose granted effect was actually
 * VISION; every other effect leaves no vision footprint to reseed.
 */
export const seedWaystationVisionBonus = (
  coverage: WaystationVisibilityCoverage,
  callbacks: VisibilityTransitionCallbacks,
  tile: Pick<DomainTileState, "x" | "y" | "waystation">
): void => {
  const waystation = tile.waystation;
  if (!waystation?.activated || !waystation.activatedByPlayerId || waystation.grantedEffect !== "VISION") return;
  const x = waystation.revealedAtX ?? tile.x;
  const y = waystation.revealedAtY ?? tile.y;
  coverage.addTileVisionBonus(waystation.activatedByPlayerId, x, y, WAYSTATION_REVEAL_RADIUS, callbacks, WAYSTATION_VISION_REASON);
};

/**
 * Finds the nearest tile owned by `playerId` that carries a town, measured
 * as flat (non-toroidal) squared distance from (x, y). A full-map scan is
 * acceptable here: activation only happens once per waystation, ever (there
 * are at most a few hundred on a 450x450 map), unlike the ring-radius lookup
 * in town-support-lookup.ts (assignedTownKeyForSupportTile), which is built
 * for a *specific* town's support ring and doesn't answer "which of my
 * towns, anywhere on the map, is closest to this arbitrary tile" -- the
 * question a waystation's population burst needs answered. Deliberately not
 * wrap-aware (unlike chebyshevDistance in season-seed-world.ts): a
 * waystation's town-support bonus going to the second-nearest town on a rare
 * across-the-seam case is a cosmetic miss, not a correctness bug worth the
 * extra plumbing.
 */
const nearestOwnedTownKey = (
  tiles: ReadonlyMap<string, DomainTileState>,
  playerId: string,
  x: number,
  y: number
): string | undefined => {
  let bestKey: string | undefined;
  let bestDistanceSq = Infinity;
  for (const [tileKey, tile] of tiles) {
    if (tile.ownerId !== playerId || !tile.town) continue;
    const dx = tile.x - x;
    const dy = tile.y - y;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq < bestDistanceSq || (distanceSq === bestDistanceSq && (!bestKey || tileKey < bestKey))) {
      bestDistanceSq = distanceSq;
      bestKey = tileKey;
    }
  }
  return bestKey;
};

/**
 * Finds the nearest tile carrying a town -- ANY owner, including
 * neutral/unowned -- within WAYSTATION_VISION_TOWN_SEARCH_RADIUS of (x, y),
 * measured as flat (non-toroidal) squared distance. Unlike
 * nearestOwnedTownKey this is not owner-restricted (the VISION effect reveals
 * a nearby settlement's location as a scouting reward, regardless of who
 * holds it) and is radius-bounded rather than a full-map scan, since "no town
 * anywhere nearby" is the common case and should stay cheap. Deterministic
 * tie-break by tileKey, mirroring nearestOwnedTownKey.
 */
const nearestTownKeyWithinRadius = (
  tiles: ReadonlyMap<string, DomainTileState>,
  x: number,
  y: number,
  radius: number
): string | undefined => {
  const radiusSq = radius * radius;
  let bestKey: string | undefined;
  let bestDistanceSq = Infinity;
  for (const [tileKey, tile] of tiles) {
    if (!tile.town) continue;
    const dx = tile.x - x;
    const dy = tile.y - y;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq > radiusSq) continue;
    if (distanceSq < bestDistanceSq || (distanceSq === bestDistanceSq && (!bestKey || tileKey < bestKey))) {
      bestDistanceSq = distanceSq;
      bestKey = tileKey;
    }
  }
  return bestKey;
};

/**
 * Grants the VISION effect: reveals WAYSTATION_REVEAL_RADIUS around the
 * nearest town (any owner) within WAYSTATION_VISION_TOWN_SEARCH_RADIUS of the
 * waystation's own (x, y) -- a scouting reward pointing at a real settlement
 * rather than just the outpost's own empty frontier tile. Falls back to
 * revealing around the waystation's own (x, y) when no town is in range; this
 * is a deliberate, signed-off fallback (not a TODO), since the effect must
 * still do *something* even on a town-sparse frontier. Returns the (x, y)
 * actually revealed so the caller can record it on the tile for
 * seedWaystationVisionBonus to read back verbatim at boot.
 */
const grantWaystationVision = (
  input: WaystationActivationInput,
  playerId: string,
  x: number,
  y: number
): { revealedAtX: number; revealedAtY: number } => {
  const townKey = nearestTownKeyWithinRadius(input.tiles, x, y, WAYSTATION_VISION_TOWN_SEARCH_RADIUS);
  const townTile = townKey ? input.tiles.get(townKey) : undefined;
  const revealedAtX = townTile?.x ?? x;
  const revealedAtY = townTile?.y ?? y;
  input.visibilityCoverage.addTileVisionBonus(playerId, revealedAtX, revealedAtY, WAYSTATION_REVEAL_RADIUS, input.visionTransitionCallbacks, WAYSTATION_VISION_REASON);
  return { revealedAtX, revealedAtY };
};

/**
 * Grants the population-burst effect to the player's nearest owned town, if
 * any. Mirrors grantGranaryPopulationBurst (runtime-structure-build-completion.ts)
 * but keyed off the nearest town rather than a specific support-ring town.
 * Returns the town's name and coordinates (for the client popup's copy and
 * its "Jump to Town" button) so the caller can record them on the
 * waystation tile's wire-visible detail -- undefined when there's no nearby
 * owned town (silent no-op); name alone can still be undefined separately
 * if the town has no name set.
 */
const grantWaystationPopulationBurst = (input: WaystationActivationInput, playerId: string, x: number, y: number, commandId: string): { name: string | undefined; x: number; y: number } | undefined => {
  const townKey = nearestOwnedTownKey(input.tiles, playerId, x, y);
  if (!townKey) return undefined;
  const townTile = input.tiles.get(townKey);
  if (!townTile?.town || townTile.ownerId !== playerId) return undefined;
  const updatedTownTile: DomainTileState = {
    ...townTile,
    town: {
      ...townTile.town,
      population: (townTile.town.population ?? 0) + WAYSTATION_POP_BURST,
      maxPopulation: (townTile.town.maxPopulation ?? 0) + WAYSTATION_POP_BURST
    }
  };
  input.replaceTileState(townKey, updatedTownTile, commandId);
  input.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId, playerId, tileDeltas: [input.tileDeltaFromState(updatedTownTile)] });
  return { name: townTile.town.name, x: townTile.x, y: townTile.y };
};

/**
 * Grants the TECH effect: picks a random tier-1 tech (a tree root -- no
 * prereqIds) the player does not already own, via the injected `random`, and
 * adds it to the player's techIds -- applying the same side effects a paid
 * research grant applies via chooseTechForPlayer (aether-tower unlock
 * linkage and a mods recompute) so a live client's cached multipliers never
 * go stale, and emits a TECH_UPDATE event so an already-connected client's
 * tech list/UI picks up the grant immediately.
 *
 * If the player already owns every tier-1 tech, this is a deliberate no-op:
 * nothing is granted (don't crash, don't touch player state), but the tile
 * still consumes its one-shot activation regardless -- the caller records no
 * grantedTechId in that case, which the client's activation popup reads as
 * "don't show a tech-grant dialog".
 *
 * Returns the granted tech id, or undefined if the no-op fallback applied.
 */
const grantWaystationTech = (input: WaystationActivationInput, player: DomainPlayer, playerId: string, commandId: string, random: () => number): string | undefined => {
  const tierOneIds = [...techEntryById.values()].filter((tech) => tech.tier === 1 && !(tech.prereqIds && tech.prereqIds.length > 0) && !tech.requires).map((tech) => tech.id);
  const unownedTierOneIds = tierOneIds.filter((id) => !player.techIds.has(id));
  if (unownedTierOneIds.length === 0) return undefined;
  const techId = unownedTierOneIds[Math.floor(random() * unownedTierOneIds.length) % unownedTierOneIds.length];
  if (!techId) return undefined;
  player.techIds.add(techId);
  grantAetherTowerUnlockIfLinked(player, techId);
  player.mods = recomputeMods(player);
  input.emitEvent({
    eventType: "TECH_UPDATE",
    commandId,
    playerId,
    payloadJson: JSON.stringify(buildTechUpdatePayload(player, input.tiles.values()))
  });
  return techId;
};

/**
 * Grants the RESOURCE_SLOT effect: +WAYSTATION_RESOURCE_SLOT_BONUS to
 * whichever of FOOD/TITANIUM/CRYSTAL/UMBRITE the player currently has the
 * fewest counted slots of (player.strategicResources, missing/undefined
 * counts as 0), tie-broken by array order (FOOD first). Merged additively
 * into player.waystationResourceSlotBonus so repeated activations can each
 * land on a different resource depending on the player's current counts.
 * Returns the resource that was bumped.
 */
const grantWaystationResourceSlotBonus = (player: DomainPlayer): "FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" => {
  let target: (typeof WAYSTATION_SLOT_RESOURCES)[number] = WAYSTATION_SLOT_RESOURCES[0];
  let lowestCount = Infinity;
  for (const resource of WAYSTATION_SLOT_RESOURCES) {
    const count = player.strategicResources?.[resource] ?? 0;
    if (count < lowestCount) {
      lowestCount = count;
      target = resource;
    }
  }
  const bonus = { ...(player.waystationResourceSlotBonus ?? {}) };
  bonus[target] = (bonus[target] ?? 0) + WAYSTATION_RESOURCE_SLOT_BONUS;
  player.waystationResourceSlotBonus = bonus;
  return target;
};

/**
 * Activates a dormant waystation the first time a player expands onto its
 * tile: flips it to activated and grants exactly ONE of four possible
 * permanent effects, chosen uniformly at random via the injected `random`
 * (defaults to Math.random) --
 *  0. VISION: a permanent map-vision reveal (same coverage-tracker plumbing
 *     as a watchtower's pulse, but never removed) centered on the nearest
 *     town within range, or the waystation's own tile as a fallback;
 *  1. POPULATION: a population burst to the player's nearest owned town;
 *  2. TECH: a random unowned tier-1 tech, granted outright;
 *  3. RESOURCE_SLOT: a +1 bump to whichever strategic resource the player
 *     has the least of.
 * No-op if the tile has no waystation or it was already activated (one-time
 * only, never re-fires). Unlike watchtowers there is no expiry/tick-cleanup
 * step -- everything granted here is permanent. Which effect fired (and its
 * detail: revealed coordinates, granted tech id, granted resource, or the
 * granted-population town's name) is
 * recorded on tile.waystation itself so the client's activation-result popup
 * (client-waystation-activation/) can read it straight off the wire delta.
 */
export const activateWaystationAt = (
  input: WaystationActivationInput,
  targetKey: string,
  x: number,
  y: number,
  playerId: string,
  commandId: string
): void => {
  const tile = input.tiles.get(targetKey);
  if (!tile?.waystation || tile.waystation.activated) return;
  // Resolve the player BEFORE any mutation: this activation is a strict
  // one-shot (the `activated` guard above never lets it retry), so if the
  // player record is somehow missing at this call site we must bail out
  // without flipping the tile or granting anything -- otherwise the
  // waystation would burn its one activation with no effect applied at all,
  // permanently.
  const player = input.players.get(playerId);
  if (!player) return;

  const random = input.random ?? Math.random;
  const effectIndex = Math.floor(random() * WAYSTATION_EFFECTS.length) % WAYSTATION_EFFECTS.length;
  const effect = WAYSTATION_EFFECTS[effectIndex] ?? "VISION";

  const waystationResult: NonNullable<DomainTileState["waystation"]> = { activated: true, activatedByPlayerId: playerId, grantedEffect: effect };

  // Resolve the chosen effect's grant (and its wire-visible detail field, if
  // any) BEFORE writing the waystation tile itself, so the single tile delta
  // emitted below already carries the full, final result -- no second write
  // or re-emit needed.
  if (effect === "VISION") {
    // Same permanent-bonus API a Relay Beacon uses (addTileVisionBonus)
    // rather than the watchtower's addTemporaryReveal -- that API is
    // explicitly contracted as temporary ("the caller is responsible for
    // calling removeTemporaryReveal... once the effect expires",
    // visibility-coverage-cache.ts) and mislabels its footprint
    // "temporary-reveal", which is wrong for an effect that must never
    // expire and also survive a restart (see seedWaystationVisionBonus).
    const { revealedAtX, revealedAtY } = grantWaystationVision(input, playerId, x, y);
    waystationResult.revealedAtX = revealedAtX;
    waystationResult.revealedAtY = revealedAtY;
  } else if (effect === "TECH") {
    const grantedTechId = grantWaystationTech(input, player, playerId, commandId, random);
    if (grantedTechId) waystationResult.grantedTechId = grantedTechId;
  } else if (effect === "RESOURCE_SLOT") {
    waystationResult.grantedResource = grantWaystationResourceSlotBonus(player);
  } else if (effect === "POPULATION") {
    const grantedTown = grantWaystationPopulationBurst(input, playerId, x, y, commandId);
    if (grantedTown) {
      if (grantedTown.name) waystationResult.grantedTownName = grantedTown.name;
      waystationResult.grantedTownX = grantedTown.x;
      waystationResult.grantedTownY = grantedTown.y;
    }
  }

  const updated: DomainTileState = { ...tile, waystation: waystationResult };
  input.replaceTileState(targetKey, updated, commandId);
  input.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId, playerId, tileDeltas: [input.tileDeltaFromState(updated)] });
};
