// ISLAND_NAMES push: every online human gets the island label list (shared
// island-names.ts) on connect and whenever what *they* may see of it changes.
// Run from the simulation service's 1s ticker alongside the Aether shield
// push; rebuilds at most every ISLAND_NAMES_TICK_MIN_INTERVAL_MS. Cost per
// run: one pass over each *named* island's tiles (unnamed islands are
// static), then a cheap per-viewer projection, so it scales with how many
// islands players have named, not with the map.
//
// Fog: generated names and island shapes follow from the world seed the
// client already has; a chosen name and its held / contested / fading state
// only go to players with a stake on that island (island-labels.ts). The
// client only draws a label on explored ground.
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { ISLAND_NAMES_MESSAGE_TYPE, type IslandNamesPayload } from "@border-empires/shared";
import { buildIslandLabels, islandLabelsForViewer, islandLabelsSignature, type IslandLabelSet } from "./island-labels.js";
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
  // Last signature sent to each viewer; pruned to subscribed humans every run, so bounded by online players.
  const sentSignatureByViewer = new Map<string, string>();
  const labelSetAt = (nowMs: number): IslandLabelSet => {
    const tiles = deps.tiles();
    return buildIslandLabels(islandNamesWorldFor(tiles), tiles, deps.players(), nowMs);
  };
  const send = (playerId: string, set: IslandLabelSet): void => {
    const islands = islandLabelsForViewer(set, playerId);
    sentSignatureByViewer.set(playerId, islandLabelsSignature(islands));
    deps.emitPlayerMessage({ commandId: `island-names:${playerId}`, playerId }, { type: ISLAND_NAMES_MESSAGE_TYPE, islands });
  };
  return {
    tick: (nowMs) => {
      if (nowMs - lastRunAt < ISLAND_NAMES_TICK_MIN_INTERVAL_MS) return;
      lastRunAt = nowMs;
      // Built even with nobody online: claim upkeep (fading, reverting) runs here.
      const set = labelSetAt(nowMs);
      const online = new Set<string>();
      for (const [playerId, player] of deps.players()) {
        if (player.isAi || !deps.isPlayerSubscribed(playerId)) continue;
        online.add(playerId);
        if (sentSignatureByViewer.get(playerId) !== islandLabelsSignature(islandLabelsForViewer(set, playerId))) send(playerId, set);
      }
      for (const playerId of [...sentSignatureByViewer.keys()]) if (!online.has(playerId)) sentSignatureByViewer.delete(playerId);
    },
    sendTo: (playerId, nowMs) => send(playerId, labelSetAt(nowMs))
  };
};
