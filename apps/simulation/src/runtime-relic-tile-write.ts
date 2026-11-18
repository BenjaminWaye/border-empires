import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";

import { activateRelic } from "./runtime-relics.js";
import { prepareWonderTileWrite } from "./runtime-natural-wonders.js";
import type { RuntimePlayer } from "./runtime-types.js";

import type { ResourceSlotTotals } from "./resource-slot-view/resource-slot-view.js";

export type RelicTileWriteDeps = {
  players: Map<string, RuntimePlayer>;
  now: number;
  resourceSlotSupplyForPlayer: (playerId: string) => ResourceSlotTotals;
  resourceSlotDemandForPlayer: (playerId: string) => ResourceSlotTotals;
  playerManpowerCap: (player: RuntimePlayer) => number;
  commandId: string;
  emitEvent: (event: SimulationEvent) => void;
};

/** Applies relic activation and wonder bookkeeping to a tile about to be written (see Runtime.replaceTileState). */
export const prepareRelicTileWrite = (previous: DomainTileState | undefined, nextTile: DomainTileState, deps: RelicTileWriteDeps): DomainTileState => {
  const relicOwner = nextTile.ownerId ? deps.players.get(nextTile.ownerId) : undefined;
  const isRelic = nextTile.naturalWonder?.relicVersion === 1;
  const relicTotals = isRelic && nextTile.naturalWonder?.type === "FOUNDRY_HEART" && !nextTile.naturalWonder.resourceBonus && relicOwner
    ? { supply: deps.resourceSlotSupplyForPlayer(relicOwner.id), demand: deps.resourceSlotDemandForPlayer(relicOwner.id) }
    : undefined;
  const manpowerCap = isRelic && nextTile.naturalWonder?.type === "CONSCRIPTION_ENGINE" && relicOwner ? deps.playerManpowerCap(relicOwner) : 0;
  const tile = activateRelic(nextTile, relicOwner, deps.now, manpowerCap, relicTotals, { commandId: deps.commandId, emitEvent: deps.emitEvent });
  prepareWonderTileWrite(tile, previous, deps.players, deps.now);
  return tile;
};
