// One player's full slot supply plus the labelled rows behind it, for the
// runtime's cached supply read (RuntimeEconomyCaches.resourceSlotSupply).
// Every slot is added through the same sink, so the rows always add up to the
// totals: tiles and their boosts, converters, the upgrade grant, waystations,
// siphons (in and out), Foundry Heart and relics.

import { createResourceSlotSourceCollector, type ResourceSlotGrant } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";
import { applyFoundryHeartSlotBonus } from "../runtime-natural-wonders.js";
import { addRelicResourceSupply, type RelicReadContext } from "../runtime-relics.js";
import type { ResourceSlotSupplyBuild } from "../runtime-economy-caches/runtime-economy-caches.js";
import type { RuntimePlayer } from "../runtime-types.js";
import { resourceSlotSupplyWithSiphonTransfer } from "../siphon-mode/siphon-slot-transfer.js";
import { domainResourceSlotGrant } from "../tech-domain-bridge/tech-domain-bridge.js";
import { techGrantedFishFoodSlotBonus } from "../tech-domain-bridge/fish-food-slot-bonus.js";

export type ResourceSlotSupplyBuildDeps = {
  players: ReadonlyMap<string, RuntimePlayer>;
  tiles: ReadonlyMap<string, DomainTileState>;
  settledTilesForPlayer: (playerId: string) => DomainTileState[];
  activeObservatoryKeysForPlayer: (playerId: string) => Iterable<string>;
  hasFoundryHeart: (playerId: string) => boolean;
  summaryForPlayer: RelicReadContext["summaryForPlayer"];
};

/** The upgrade and waystation grants, each labelled with its source. */
export const resourceSlotGrantsForPlayer = (player: RuntimePlayer | undefined): ResourceSlotGrant[] => {
  if (!player) return [];
  const grants: ResourceSlotGrant[] = [];
  const upgrade = domainResourceSlotGrant(player);
  if (upgrade) grants.push(upgrade);
  if (player.waystationResourceSlotBonus) grants.push({ kind: "WAYSTATION", id: "", supply: player.waystationResourceSlotBonus });
  return grants;
};

export const buildResourceSlotSupply = (deps: ResourceSlotSupplyBuildDeps, playerId: string): ResourceSlotSupplyBuild => {
  const { sink, rows } = createResourceSlotSourceCollector();
  // Siphon: drained resource tiles' slots move from owner to caster (siphon-slot-transfer.ts).
  const totals = resourceSlotSupplyWithSiphonTransfer({
    playerId,
    tiles: deps.tiles,
    settledTilesForPlayer: deps.settledTilesForPlayer,
    activeObservatoryKeysForPlayer: deps.activeObservatoryKeysForPlayer,
    grantsForPlayer: (id) => resourceSlotGrantsForPlayer(deps.players.get(id)),
    fishFoodSlotBonusForPlayer: (id) => { const p = deps.players.get(id); return p ? techGrantedFishFoodSlotBonus(p) : 0; },
    onSource: sink
  });
  applyFoundryHeartSlotBonus(deps.hasFoundryHeart(playerId), totals, sink);
  addRelicResourceSupply({ tiles: deps.tiles, summaryForPlayer: deps.summaryForPlayer }, deps.players.get(playerId), totals, sink);
  return { totals, sources: rows() };
};
