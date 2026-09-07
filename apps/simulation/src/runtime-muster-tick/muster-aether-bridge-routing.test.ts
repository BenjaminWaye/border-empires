import { describe, expect, it } from "vitest";
import type { DomainTileState, FrontierCommandType } from "@border-empires/game-domain";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { tickMuster, type MusterTickInput } from "./runtime-muster-tick.js";
import type { LockRecord } from "../runtime-types.js";

/**
 * Regression coverage for the ADVANCE/MARCH BFS crossing an active aether
 * bridge instead of only ever walking plain adjacency (+ dock links) through
 * owned territory. Before the fix, a muster flag adjacent to a bridge with
 * enemy tiles reachable via the bridge's far side would either fire on some
 * unrelated, much more distant enemy tile found by walking the flag's own
 * contiguous territory (ADVANCE), or refuse to route through the bridge and
 * try to physically expand around it (MARCH) — see runtime-muster-tick.ts /
 * runtime-muster-march.ts's BFS neighbor construction.
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
  bridgeLinks: ReadonlyMap<string, readonly string[]>,
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
    activeSiegeOutpostsByOwner: new Map(),
    activeRelayBeaconsByOwner: new Map(),
    railDepotPositionsByOwner: new Map(),
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
    locksByTile: new Map<string, LockRecord>(),
    advanceCooldowns: new Map(),
    dockLinksByDockTileKey: new Map(),
    aetherBridgeNeighborKeysForPlayer: () => bridgeLinks,
    isStructureDormant: () => false,
    isInReach: () => true
  };
};

describe("ADVANCE/MARCH auto-fire routes through active aether bridges", () => {
  it("ADVANCE fires on the enemy tile reachable via the bridge's far side, not a distant tile in its own territory", () => {
    // Muster flag at (0,0) sits right next to the bridge's near endpoint
    // (1,0). The bridge links (1,0) <-> (100,0). The only attackable enemy
    // tile within a couple of hops is on the far side, at (101,0). A long
    // chain of the player's own owned tiles stretches away from the flag in
    // the opposite direction with a distant enemy tile at the far end
    // (50,0) — mirroring the reported bug where ADVANCE attacked tiles ~50
    // tiles away instead of the ones just past the bridge.
    const musterTile = tile(0, 0, {
      ownerId: "player-1",
      muster: { ownerId: "player-1", amount: 60, mode: "ADVANCE", updatedAt: 1_000 }
    });
    const tiles: DomainTileState[] = [musterTile, tile(1, 0, { ownerId: "player-1" })];
    for (let x = -1; x >= -50; x -= 1) {
      tiles.push(tile(x, 0, { ownerId: "player-1" }));
    }
    tiles.push(tile(-51, 0, { ownerId: "player-2" }));
    // Bridge far side + the attackable enemy tile just past it.
    tiles.push(tile(100, 0, { ownerId: "player-1" }));
    tiles.push(tile(101, 0, { ownerId: "player-2" }));

    const bridgeLinks = new Map<string, readonly string[]>([
      ["1,0", ["100,0"]],
      ["100,0", ["1,0"]]
    ]);

    const captured: Captured[] = [];
    const input = buildInput(tiles, musterTile, bridgeLinks, captured);
    tickMuster(input);

    expect(captured).toHaveLength(1);
    expect(captured[0]!.type).toBe("ATTACK");
    const payload = JSON.parse(captured[0]!.command.payloadJson!);
    expect(payload.toX).toBe(101);
    expect(payload.toY).toBe(0);
  });

  it("MARCH routes a flag across an active aether bridge toward its target instead of expanding around it", () => {
    // Flag at (0,0), owned tile (1,0) adjacent to the bridge's near endpoint,
    // bridge links (1,0) <-> (100,0). Target is (101,0), on the far side and
    // otherwise unreachable except across open water. With no other route,
    // MARCH must attack through the bridge instead of falling back to
    // expanding in some other direction to hunt for a path.
    const musterTile = tile(0, 0, {
      ownerId: "player-1",
      muster: { ownerId: "player-1", amount: 60, mode: "MARCH", updatedAt: 1_000, targetX: 101, targetY: 0 }
    });
    const tiles: DomainTileState[] = [
      musterTile,
      tile(1, 0, { ownerId: "player-1" }),
      tile(100, 0, { ownerId: "player-1" }),
      tile(101, 0, { ownerId: "player-2" })
    ];

    const bridgeLinks = new Map<string, readonly string[]>([
      ["1,0", ["100,0"]],
      ["100,0", ["1,0"]]
    ]);

    const captured: Captured[] = [];
    const input = buildInput(tiles, musterTile, bridgeLinks, captured);
    tickMuster(input);

    expect(captured).toHaveLength(1);
    expect(captured[0]!.type).toBe("ATTACK");
    const payload = JSON.parse(captured[0]!.command.payloadJson!);
    expect(payload.toX).toBe(101);
    expect(payload.toY).toBe(0);
  });
});
