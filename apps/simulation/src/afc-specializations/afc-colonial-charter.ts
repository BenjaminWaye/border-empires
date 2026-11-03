// Colonial Charter (AFC Dominion II): every garrisoned town a House holds gets
// one free, already-active Incubation Engine on an open support tile, with no
// Coin, manpower or Incubation Corps requirement. The engine still occupies its
// FOOD slot, so a starving empire sees it go dormant like any other consumer.
//
// The town remembers which House received the grant
// (`town.colonialIncubationGrantedTo`), so each owner is granted once per town
// and the record survives restarts with the tile; a captured town is granted
// again to its new charter-holding owner. Settlements (which cannot support
// economic structures) and towns that already have an Incubation Engine are
// skipped. A throttled sweep over charter holders' own towns delivers to new
// towns and retries towns that had no open support tile.
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import { INCUBATION_ENGINE_INSTANT_POPULATION_BURST } from "@border-empires/shared";
import { economicStructureForSupportedTown, openTownSupportNeighborTiles } from "../town-support-lookup.js";
import { additiveEffectForPlayer } from "../tech-domain-bridge/tech-domain-bridge.js";
import type { SimulationTileWireDelta } from "../runtime-types.js";

export const COLONIAL_CHARTER_SWEEP_INTERVAL_MS = 15_000;

export interface ColonialCharterDeps {
  tiles: ReadonlyMap<string, DomainTileState>;
  players: ReadonlyMap<string, DomainPlayer>;
  ownedTownKeys: (playerId: string) => Iterable<string>;
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  emitEvent: (event: SimulationEvent) => void;
  emitPlayerStateUpdate: (command: Pick<CommandEnvelope, "commandId" | "playerId">) => void;
}

/** Delivers any outstanding free engines for one House. Returns how many were placed. */
export function grantColonialIncubationEngines(deps: ColonialCharterDeps, player: DomainPlayer, now: number): number {
  if (additiveEffectForPlayer(player, "colonialIncubationEngine") <= 0) return 0;
  const commandId = `afc-colonial-charter:${player.id}:${now}`;
  const deltas: SimulationTileWireDelta[] = [];
  for (const townKey of [...deps.ownedTownKeys(player.id)]) {
    const townTile = deps.tiles.get(townKey);
    if (!townTile?.town || townTile.ownerId !== player.id || townTile.ownershipState !== "SETTLED" || townTile.town.colonialIncubationGrantedTo === player.id) continue;
    if (townTile.town.populationTier === "SETTLEMENT") continue; // settlements cannot support economic structures; granted once they grow
    if (economicStructureForSupportedTown(deps.tiles, player.id, townKey, "INCUBATION_ENGINE")) continue; // already has one
    const site = openTownSupportNeighborTiles(deps.tiles, player.id, townKey).sort((a, b) => a.y - b.y || a.x - b.x)[0];
    if (!site) continue; // no open support tile yet: retried on the next sweep
    const engineTile: DomainTileState = { ...site, economicStructure: { ownerId: player.id, type: "INCUBATION_ENGINE", status: "active", activatedAt: now } };
    deps.replaceTileState(`${site.x},${site.y}`, engineTile, commandId);
    const grownTown: DomainTileState = { ...townTile, town: {
      ...townTile.town, colonialIncubationGrantedTo: player.id,
      population: (townTile.town.population ?? 0) + INCUBATION_ENGINE_INSTANT_POPULATION_BURST,
      maxPopulation: (townTile.town.maxPopulation ?? 0) + INCUBATION_ENGINE_INSTANT_POPULATION_BURST
    } };
    deps.replaceTileState(townKey, grownTown, commandId);
    deltas.push(deps.tileDeltaFromState(engineTile), deps.tileDeltaFromState(grownTown));
  }
  if (!deltas.length) return 0;
  deps.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId, playerId: player.id, tileDeltas: deltas });
  if (!player.isAi) deps.emitPlayerStateUpdate({ commandId, playerId: player.id });
  return deltas.length / 2;
}

/** Throttled sweep over charter holders only; each town costs one flag check once granted. */
export function createColonialCharterSweep(deps: () => ColonialCharterDeps): (now: number) => void {
  let lastRunAt = Number.NEGATIVE_INFINITY;
  return now => {
    if (now - lastRunAt < COLONIAL_CHARTER_SWEEP_INTERVAL_MS) return;
    lastRunAt = now;
    const resolved = deps();
    for (const player of resolved.players.values()) if (player.domainIds?.has("afc-dominion-2")) grantColonialIncubationEngines(resolved, player, now);
  }
}
