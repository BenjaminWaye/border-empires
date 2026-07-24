import type { SimulationEvent } from "@border-empires/sim-protocol";
import {
  AETHER_CACHE_GRANT_CHANCE_PER_INTERVAL,
  AETHER_CACHE_MAX_CHARGES
} from "@border-empires/game-domain";
import type { RuntimePlayer } from "./runtime-types.js";

export type AetherCacheGrantTickInput = {
  players: ReadonlyMap<string, RuntimePlayer>;
  emitEvent: (event: SimulationEvent) => void;
  random?: () => number;
};

// Rolled once per player per grant-tick interval (see AETHER_CACHE_GRANT_INTERVAL_MS
// in server-game-constants.ts) — a small, steady chance of a windfall for
// active human players, capped so caches stay a rare treat rather than a
// resource to farm.
export const tickAetherCacheGrant = (input: AetherCacheGrantTickInput): void => {
  const random = input.random ?? Math.random;
  for (const player of input.players.values()) {
    if (player.isAi) continue;
    if (player.id.startsWith("barbarian-")) continue;
    const chargesRemaining = player.aetherCacheCharges ?? 0;
    if (chargesRemaining >= AETHER_CACHE_MAX_CHARGES) continue;
    if (random() >= AETHER_CACHE_GRANT_CHANCE_PER_INTERVAL) continue;
    player.aetherCacheCharges = chargesRemaining + 1;
    input.emitEvent({
      eventType: "PLAYER_MESSAGE",
      commandId: `aether-cache:grant:${player.id}:${player.aetherCacheCharges}`,
      playerId: player.id,
      messageType: "AETHER_CACHE_EVENT",
      payloadJson: JSON.stringify({
        type: "AETHER_CACHE_EVENT",
        phase: "granted",
        charges: player.aetherCacheCharges
      })
    });
  }
};
