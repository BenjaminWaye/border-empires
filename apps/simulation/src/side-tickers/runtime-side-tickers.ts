// Throttled per-second side work the runtime drives from the simulation
// service's 1s ticker, kept out of runtime.ts (over the 500-line cap):
//   - ISLAND_NAMES push (island-names/island-names-ticker.ts): derived, never snapshotted;
//   - House Charges upkeep (house-charges/house-charges-ticker.ts): deals and
//     tracks charges on player state, which is snapshotted with each player.
// Each ticker throttles itself; `tick` is cheap to call every second.
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { IslandNamesPayload } from "@border-empires/shared";
import { createHouseChargesTicker } from "../house-charges/house-charges-ticker.js";
import { createIslandNamesTicker } from "../island-names/island-names-ticker.js";

export type RuntimeSideTickersDeps = {
  readonly tiles: () => ReadonlyMap<string, DomainTileState>;
  readonly players: () => ReadonlyMap<string, DomainPlayer>;
  readonly isPlayerSubscribed: (playerId: string) => boolean;
  readonly emitPlayerMessage: (command: Pick<CommandEnvelope, "commandId" | "playerId">, payload: IslandNamesPayload) => void;
};

export type RuntimeSideTickers = {
  readonly tick: (nowMs: number) => void;
  /** Live-subscribe push of what each ticker sends a player on connect. */
  readonly sendTo: (playerId: string, nowMs: number) => void;
};

export const createRuntimeSideTickers = (deps: RuntimeSideTickersDeps): RuntimeSideTickers => {
  const islandNames = createIslandNamesTicker(deps);
  const houseCharges = createHouseChargesTicker({ tiles: deps.tiles, players: deps.players });
  return {
    tick: (nowMs) => {
      islandNames.tick(nowMs);
      houseCharges.tick(nowMs);
    },
    sendTo: (playerId, nowMs) => islandNames.sendTo(playerId, nowMs)
  };
};
