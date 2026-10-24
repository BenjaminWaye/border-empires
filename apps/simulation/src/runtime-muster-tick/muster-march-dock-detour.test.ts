import { describe, expect, it } from "vitest";
import type { DomainTileState, FrontierCommandType } from "@border-empires/game-domain";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { tickMuster, type MusterTickInput } from "./runtime-muster-tick.js";
import { CombatLockIndex } from "../combat-lock-index/combat-lock-index.js";

/**
 * Regression coverage for a MARCH across a strait whose only crossing is a
 * dock well off to the side. The target is 6 tiles from the flag in a
 * straight line but 29 steps away through the dock, and the route search
 * used to flood only the straight-line distance plus its local radius (18
 * steps): it never reached the flag, every shore tile fell back to the
 * straight-line estimate, and the march stalled on the beach instead of
 * heading for the dock. It now floods MUSTER_MARCH_MAX_ROUTE_STEPS.
 */

const tile = (x: number, y: number, overrides: Partial<DomainTileState> = {}): DomainTileState => ({
  x,
  y,
  terrain: "LAND",
  ownershipState: overrides.ownerId ? "SETTLED" : "FRONTIER",
  ...overrides
});

type Captured = { type: FrontierCommandType; command: CommandEnvelope };

const buildInput = (
  tiles: DomainTileState[],
  musterTile: DomainTileState,
  dockLinks: ReadonlyMap<string, readonly string[]>,
  captured: Captured[]
): MusterTickInput => {
  const tileMap = new Map(tiles.map((t) => [`${t.x},${t.y}`, t]));

  return {
    nowMs: 1_000,
    players: new Map([
      ["player-1", {
        id: "player-1",
        isAi: false,
        points: 0,
        manpower: 1_000,
        techIds: new Set(),
        domainIds: new Set(),
        mods: { attack: 1, defense: 1, income: 1, vision: 1 },
        techRootId: "rewrite-local",
        allies: new Set()
      } as any]
    ]),
    tiles: tileMap,
    musterTilesByOwner: new Map([["player-1", new Set([`${musterTile.x},${musterTile.y}`])]]),
    activeSiegeBatteriesByOwner: new Map(),
    activeRelayBeaconsByOwner: new Map(),
    neuralWorksPositionsForPlayer: () => [],
    applyManpowerRegen: () => {},
    playerManpowerCap: () => 1_000,
    replaceTileState: (tileKey, newTile) => {
      tileMap.set(tileKey, newTile);
    },
    emitEvent: () => {},
    tileDeltaFromState: (t) => ({ x: t.x, y: t.y }) as any,
    requiredMusterForTarget: () => 10,
    nextTerritoryAutomationCommandId: (label, playerId, tileKey, at) => `${label}:${playerId}:${tileKey}:${at}`,
    handleFrontierCommand: (command, actionType) => {
      captured.push({ type: actionType, command });
      return { ok: true } as any;
    },
    locksByTile: new CombatLockIndex(),
    advanceCooldowns: new Map(),
    dockLinksByDockTileKey: dockLinks,
    aetherBridgeNeighborKeysForPlayer: () => new Map(),
    isTileVisibleToPlayer: () => true,
    isStructureDormant: () => false,
    isInReach: () => true
  };
};

describe("MARCH routes around a strait through a distant dock", () => {
  it("expands toward the dock when the target is close in a straight line but far by route", () => {
    // Rows 0-1: the flag's shore, owned x=0..9, neutral x=10..16.
    // Rows 2-4: sea. Rows 5-6: the far shore, target (0,6) held by player-2.
    // Dock (14,1) <-> (14,5): route target -> (14,5) is 14 steps, the hop
    // 1, and (14,1) -> flag (0,0) 14 more: 29 in all.
    const musterTile = tile(0, 0, {
      ownerId: "player-1",
      muster: { ownerId: "player-1", amount: 60, mode: "MARCH", updatedAt: 1_000, targetX: 0, targetY: 6 }
    });
    const tiles: DomainTileState[] = [musterTile];
    for (let x = -2; x <= 16; x += 1) {
      for (let y = 0; y <= 6; y += 1) {
        if (x === 0 && y === 0) continue;
        if (y >= 2 && y <= 4) tiles.push(tile(x, y, { terrain: "SEA" }));
        else if (y <= 1) tiles.push(tile(x, y, x <= 9 ? { ownerId: "player-1" } : {}));
        else tiles.push(tile(x, y, x === 0 && y === 6 ? { ownerId: "player-2" } : {}));
      }
    }
    const dockLinks = new Map<string, readonly string[]>([
      ["14,1", ["14,5"]],
      ["14,5", ["14,1"]]
    ]);

    const captured: Captured[] = [];
    tickMuster(buildInput(tiles, musterTile, dockLinks, captured));

    expect(captured).toHaveLength(1);
    expect(captured[0]!.type).toBe("EXPAND");
    const payload = JSON.parse(captured[0]!.command.payloadJson!);
    expect(payload.toX).toBe(10);
  });
});
