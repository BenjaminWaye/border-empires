import type { SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { WAYSTATION_POP_BURST, WAYSTATION_REVEAL_RADIUS, WAYSTATION_RESOURCE_SLOT_BONUS, WAYSTATION_TECH_GRANT_ID } from "@border-empires/shared";
import { buildTechUpdatePayload, recomputeMods } from "./tech-domain-bridge/tech-domain-bridge.js";
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
};

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
 */
export const seedWaystationVisionBonus = (
  coverage: WaystationVisibilityCoverage,
  callbacks: VisibilityTransitionCallbacks,
  tile: Pick<DomainTileState, "x" | "y" | "waystation">
): void => {
  if (!tile.waystation?.activated || !tile.waystation.activatedByPlayerId) return;
  coverage.addTileVisionBonus(tile.waystation.activatedByPlayerId, tile.x, tile.y, WAYSTATION_REVEAL_RADIUS, callbacks, WAYSTATION_VISION_REASON);
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

/** Grants the population-burst effect to the player's nearest owned town, if any. Mirrors grantGranaryPopulationBurst (runtime-structure-build-completion.ts) but keyed off the nearest town rather than a specific support-ring town. */
const grantWaystationPopulationBurst = (input: WaystationActivationInput, playerId: string, x: number, y: number, commandId: string): void => {
  const townKey = nearestOwnedTownKey(input.tiles, playerId, x, y);
  if (!townKey) return;
  const townTile = input.tiles.get(townKey);
  if (!townTile?.town || townTile.ownerId !== playerId) return;
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
};

/**
 * Grants the tech effect: adds WAYSTATION_TECH_GRANT_ID to the player's
 * techIds (no-op if already owned), applying the same side effects a paid
 * research grant applies via chooseTechForPlayer -- aether-tower unlock
 * linkage and a mods recompute -- so a live client's cached multipliers
 * never go stale, and emits a TECH_UPDATE event so an already-connected
 * client's tech list/UI picks up the grant immediately rather than waiting
 * for an unrelated reconnect/resync.
 */
const grantWaystationTech = (input: WaystationActivationInput, player: DomainPlayer, playerId: string, commandId: string): void => {
  if (player.techIds.has(WAYSTATION_TECH_GRANT_ID)) return;
  player.techIds.add(WAYSTATION_TECH_GRANT_ID);
  grantAetherTowerUnlockIfLinked(player, WAYSTATION_TECH_GRANT_ID);
  player.mods = recomputeMods(player);
  input.emitEvent({
    eventType: "TECH_UPDATE",
    commandId,
    playerId,
    payloadJson: JSON.stringify(buildTechUpdatePayload(player, input.tiles.values()))
  });
};

/** Grants the pooled resource-slot bump: +WAYSTATION_RESOURCE_SLOT_BONUS to every SlotResource, merged additively so repeated waystation activations (different tiles) stack. */
const grantWaystationResourceSlotBonus = (player: DomainPlayer): void => {
  const bonus = { ...(player.waystationResourceSlotBonus ?? {}) };
  for (const resource of ["FOOD", "TITANIUM", "CRYSTAL", "UMBRITE"] as const) {
    bonus[resource] = (bonus[resource] ?? 0) + WAYSTATION_RESOURCE_SLOT_BONUS;
  }
  player.waystationResourceSlotBonus = bonus;
};

/**
 * Activates a dormant waystation the first time a player expands
 * onto its tile: flips it to activated and grants FOUR PERMANENT effects in
 * one shot --
 *  1. a permanent map-vision reveal over WAYSTATION_REVEAL_RADIUS (same
 *     coverage-tracker plumbing as a watchtower's pulse, but never removed --
 *     see the module doc comment on nearestOwnedTownKey and
 *     runtime-watchtower-reveal-tick.ts's activateWatchtowerAt for the
 *     temporary sibling of this call);
 *  2. a population burst to the player's nearest owned town;
 *  3. a tech grant (WAYSTATION_TECH_GRANT_ID);
 *  4. a +1 bump to the player's pooled resource-slot supply.
 * No-op if the tile has no waystation or it was already activated (one-time
 * only, never re-fires). Unlike watchtowers there is no expiry/tick-cleanup
 * step -- everything granted here is permanent.
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
  // without flipping the tile or granting vision -- otherwise the waystation
  // would burn its one activation with only a partial (or zero) set of the
  // four advertised effects applied, permanently.
  const player = input.players.get(playerId);
  if (!player) return;

  const updated: DomainTileState = { ...tile, waystation: { activated: true, activatedByPlayerId: playerId } };
  input.replaceTileState(targetKey, updated, commandId);
  input.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId, playerId, tileDeltas: [input.tileDeltaFromState(updated)] });

  // Effect 1: permanent vision reveal, via the same permanent-bonus API a
  // Relay Beacon uses (addTileVisionBonus) rather than the watchtower's
  // addTemporaryReveal -- that API is explicitly contracted as temporary
  // ("the caller is responsible for calling removeTemporaryReveal... once
  // the effect expires", visibility-coverage-cache.ts) and mislabels its
  // footprint "temporary-reveal", which is wrong for an effect that must
  // never expire and also survive a restart (see seedWaystationVisionBonus).
  seedWaystationVisionBonus(input.visibilityCoverage, input.visionTransitionCallbacks, updated);

  // Effect 2: population burst to the nearest owned town, if any.
  grantWaystationPopulationBurst(input, playerId, x, y, commandId);
  // Effect 3: tech grant.
  grantWaystationTech(input, player, playerId, commandId);
  // Effect 4: pooled resource-slot bump.
  grantWaystationResourceSlotBonus(player);
};
