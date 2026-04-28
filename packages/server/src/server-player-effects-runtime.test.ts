import { describe, expect, it, vi } from "vitest";

import type { Dock, TileKey } from "@border-empires/shared";

import { ABILITY_DEFS } from "./server-game-constants.js";
import { emptyPlayerEffects } from "./server-effects.js";
import { createServerPlayerEffectsRuntime } from "./server-player-effects-runtime.js";

const wrapAxis = (value: number, size: number): number => ((value % size) + size) % size;

describe("server-player-effects-runtime", () => {
  it("returns newly revealed linked-dock tiles and marks visibility dirty once", () => {
    const sourceDock: Dock = {
      dockId: "dock-a",
      tileKey: "4,4",
      pairedDockId: "dock-b",
      connectedDockIds: ["dock-b"],
      cooldownUntil: 0
    };
    const linkedDock: Dock = {
      dockId: "dock-b",
      tileKey: "9,9",
      pairedDockId: "dock-a",
      connectedDockIds: ["dock-a"],
      cooldownUntil: 0
    };
    const markVisibilityDirty = vi.fn();
    const runtime = createServerPlayerEffectsRuntime({
      techById: new Map(),
      domainById: new Map(),
      playerEffectsByPlayer: new Map(),
      revealedEmpireTargetsByPlayer: new Map(),
      revealWatchersByTarget: new Map(),
      abilityCooldownsByPlayer: new Map(),
      dynamicMissionsByPlayer: new Map(),
      forcedRevealTilesByPlayer: new Map(),
      temporaryAttackBuffUntilByPlayer: new Map(),
      temporaryIncomeBuffUntilByPlayer: new Map(),
      docksByTile: new Map<TileKey, Dock>([[sourceDock.tileKey, sourceDock]]),
      emptyPlayerEffects,
      now: () => 0,
      VISION_RADIUS: 5,
      RESOURCE_CHAIN_MULT: 2,
      VENDETTA_ATTACK_BUFF_MULT: 1.5,
      ABILITY_DEFS,
      markVisibilityDirty,
      dockLinkedDestinations: () => [linkedDock],
      parseKey: (tileKey: TileKey) => {
        const [xText, yText] = tileKey.split(",");
        return [Number(xText), Number(yText)];
      },
      key: (x: number, y: number) => `${x},${y}`,
      wrapX: wrapAxis,
      wrapY: wrapAxis,
      WORLD_WIDTH: 20,
      WORLD_HEIGHT: 20
    });

    const firstReveal = runtime.revealLinkedDocksForPlayer("player-1", sourceDock.tileKey);
    const secondReveal = runtime.revealLinkedDocksForPlayer("player-1", sourceDock.tileKey);

    expect(firstReveal).toHaveLength(9);
    expect(firstReveal).toContain("8,8");
    expect(firstReveal).toContain("10,10");
    expect(secondReveal).toEqual([]);
    expect(markVisibilityDirty).toHaveBeenCalledTimes(1);
  });
});
