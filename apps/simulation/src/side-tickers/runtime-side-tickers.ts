// Throttled per-second side work the runtime drives from the simulation
// service's 1s ticker, kept out of runtime.ts (over the 500-line cap):
//   - ISLAND_NAMES push (island-names/island-names-ticker.ts): derived, never snapshotted;
//   - House Charges upkeep (house-charges/house-charges-ticker.ts): deals and
//     tracks charges on player state, which is snapshotted with each player,
//     and pushes HOUSE_CHARGES to an online House whose charges changed.
// Each ticker throttles itself; `tick` is cheap to call every second.
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { HouseChargesPayload, IslandNamesPayload } from "@border-empires/shared";
import { createHouseChargesTicker } from "../house-charges/house-charges-ticker.js";
import { createIslandNamesTicker } from "../island-names/island-names-ticker.js";
import { houseChargesPayloadFor } from "../house-charges/house-charges-view.js";

export type RuntimeSideTickersDeps = {
  readonly tiles: () => ReadonlyMap<string, DomainTileState>;
  readonly players: () => ReadonlyMap<string, DomainPlayer>;
  readonly isPlayerSubscribed: (playerId: string) => boolean;
  readonly emitPlayerMessage: (command: Pick<CommandEnvelope, "commandId" | "playerId">, payload: IslandNamesPayload | HouseChargesPayload) => void;
};

export type RuntimeSideTickers = {
  readonly tick: (nowMs: number) => void;
  /** Live-subscribe push of what each ticker sends a player on connect. */
  readonly sendTo: (playerId: string, nowMs: number) => void;
};

export const createRuntimeSideTickers = (deps: RuntimeSideTickersDeps): RuntimeSideTickers => {
  const islandNames = createIslandNamesTicker(deps);
  // Last HOUSE_CHARGES signature sent to each online House; pruned to online humans every pass, so bounded by online players.
  const sentChargesSignature = new Map<string, string>();
  const sendHouseCharges = (playerId: string, onlyIfChanged: boolean): void => {
    const player = deps.players().get(playerId);
    const payload = player && !player.isAi ? houseChargesPayloadFor(player, deps.tiles()) : undefined;
    if (!payload) return;
    const signature = JSON.stringify(payload);
    if (onlyIfChanged && sentChargesSignature.get(playerId) === signature) return;
    sentChargesSignature.set(playerId, signature);
    deps.emitPlayerMessage({ commandId: `house-charges:${playerId}`, playerId }, payload);
  };
  // Progress, completion and a newly detected relic beacon all change the view, so compare views rather than events.
  const houseCharges = createHouseChargesTicker({
    tiles: deps.tiles,
    players: deps.players,
    onPassComplete: () => {
      const online = new Set<string>();
      for (const [playerId, player] of deps.players()) {
        if (player.isAi || !player.houseCharges || !deps.isPlayerSubscribed(playerId)) continue;
        online.add(playerId);
        sendHouseCharges(playerId, true);
      }
      for (const playerId of [...sentChargesSignature.keys()]) if (!online.has(playerId)) sentChargesSignature.delete(playerId);
    }
  });
  return {
    tick: (nowMs) => {
      islandNames.tick(nowMs);
      houseCharges.tick(nowMs);
    },
    sendTo: (playerId, nowMs) => {
      islandNames.sendTo(playerId, nowMs);
      sendHouseCharges(playerId, false);
    }
  };
};
