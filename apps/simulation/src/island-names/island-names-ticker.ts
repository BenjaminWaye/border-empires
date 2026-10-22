// ISLAND_NAMES push: every online human gets the full island label list
// (shared island-names.ts) on connect and whenever a chosen name or its
// held / contested / fading state changes. Run from the simulation service's
// 1s ticker alongside the Aether shield push; rebuilds at most every
// ISLAND_NAMES_TICK_MIN_INTERVAL_MS. Cost per run: one pass over each
// *named* island's tiles (unnamed islands are static), so it scales with
// how many islands players have named, not with the map.
//
// The list is the same for every viewer and carries no fog-sensitive data:
// island shapes follow from the world seed the client already has, and the
// client only draws a label once its centre is on explored ground.
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { ISLAND_NAMES_MESSAGE_TYPE, type IslandNamesPayload } from "@border-empires/shared";
import { buildIslandLabels, islandLabelsSignature } from "./island-labels.js";
import { islandNamesWorldFor } from "./island-names-world.js";

export const ISLAND_NAMES_TICK_MIN_INTERVAL_MS = 1_900;

export type IslandNamesTickerDeps = {
  readonly tiles: () => ReadonlyMap<string, DomainTileState>;
  readonly players: () => ReadonlyMap<string, DomainPlayer>;
  readonly isPlayerSubscribed: (playerId: string) => boolean;
  readonly emitPlayerMessage: (command: Pick<CommandEnvelope, "commandId" | "playerId">, payload: IslandNamesPayload) => void;
};

export type IslandNamesTicker = {
  /** No-op until ISLAND_NAMES_TICK_MIN_INTERVAL_MS has passed since the last run. */
  readonly tick: (nowMs: number) => void;
  /** Push `playerId` the current list now (live subscribe, or right after they rename). */
  readonly sendTo: (playerId: string, nowMs: number) => void;
};

export const createIslandNamesTicker = (deps: IslandNamesTickerDeps): IslandNamesTicker => {
  let lastRunAt = Number.NEGATIVE_INFINITY;
  let lastSignature: string | undefined;
  const payloadAt = (nowMs: number): { payload: IslandNamesPayload; signature: string } => {
    const tiles = deps.tiles();
    const islands = buildIslandLabels(islandNamesWorldFor(tiles), tiles, deps.players(), nowMs);
    return { payload: { type: ISLAND_NAMES_MESSAGE_TYPE, islands }, signature: islandLabelsSignature(islands) };
  };
  return {
    tick: (nowMs) => {
      if (nowMs - lastRunAt < ISLAND_NAMES_TICK_MIN_INTERVAL_MS) return;
      lastRunAt = nowMs;
      const { payload, signature } = payloadAt(nowMs);
      if (signature === lastSignature) return;
      // First run only records the baseline: connects get the list from sendTo.
      const firstRun = lastSignature === undefined;
      lastSignature = signature;
      if (firstRun) return;
      for (const [playerId, player] of deps.players()) {
        if (player.isAi || !deps.isPlayerSubscribed(playerId)) continue;
        deps.emitPlayerMessage({ commandId: `island-names:${playerId}`, playerId }, payload);
      }
    },
    sendTo: (playerId, nowMs) => {
      deps.emitPlayerMessage({ commandId: `island-names:${playerId}`, playerId }, payloadAt(nowMs).payload);
    }
  };
};
