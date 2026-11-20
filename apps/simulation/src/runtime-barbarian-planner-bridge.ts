/**
 * Drives the Planetary Defense planner (ai/system-job-barbarian-planner.ts) on
 * the simulation main thread, for both system producers. It reads tiles, camps
 * and awake camps straight from the runtime (planetary-defense-camps/), so
 * nothing about the barbarian has to be synced to a worker: one decision looks
 * at one camp's tiles and their neighbours (docs/planetary-defense-camps-plan.md).
 */
import type { DomainTileState } from "@border-empires/game-domain";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { createBarbarianPlanner } from "./ai/system-job-barbarian-planner.js";

export type RuntimeBarbarianBridgeDeps = {
  readonly tiles: ReadonlyMap<string, DomainTileState>;
  readonly dockLinksByDockTileKey: () => ReadonlyMap<string, readonly string[]>;
  readonly liveCampIds: () => Iterable<string>;
  readonly campTileKeys: (campId: string) => Iterable<string>;
  readonly awakeCampIds: () => readonly string[];
  /** Registers the planner's wake-up for camps next to a tile that changed owner. */
  readonly onCampNeighbourChanged: (listener: (campId: string) => void) => void;
  readonly now: () => number;
};

export type RuntimeBarbarianBridge = {
  readonly choose: (clientSeq: number, issuedAt: number) => CommandEnvelope | undefined;
  readonly settle: (commandId: string, settledAt: number, rejected?: boolean) => void;
};

export const createRuntimeBarbarianBridge = (deps: RuntimeBarbarianBridgeDeps): RuntimeBarbarianBridge => {
  const planner = createBarbarianPlanner({
    tilesByKey: deps.tiles,
    campIds: deps.liveCampIds,
    campTiles: (campId) => {
      const tiles: DomainTileState[] = [];
      for (const key of deps.campTileKeys(campId)) {
        const tile = deps.tiles.get(key);
        if (tile) tiles.push(tile);
      }
      return tiles;
    },
    getDockLinksByDockTileKey: deps.dockLinksByDockTileKey,
    getAwakeCampIds: () => new Set(deps.awakeCampIds()),
    now: deps.now
  });
  deps.onCampNeighbourChanged((campId) => planner.wakeCamp(campId));
  return {
    choose: (clientSeq, issuedAt) => planner.choose(clientSeq, issuedAt) ?? undefined,
    settle: planner.settle
  };
};
