import { afterEach, describe, expect, it, vi } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { WAYSTATION_VISION_REVEAL_TTL_MS } from "@border-empires/shared";
import { SimulationRuntime } from "../runtime/runtime.js";

// Regression (player report 2026-11-23): a waystation's VISION reward gave
// permanent live sight of a rival town -- an 11x11 window that animated,
// survived reloads and was reseeded at every server restart. It is now a
// one-time look that drops to remembered fog when it expires.
const humanPlayer = (id: string) => ({
  id,
  isAi: false,
  points: 1_000,
  manpower: 1_000,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>()
});

// Land rows 0..40, x 0..60. player-1 holds x 10..14 on row 20 with a waystation at (14, 20);
// rival-1's town sits at (30, 20), 16 tiles away: inside the reward's 20-tile search, out of sight.
const RIVAL_TOWN = "30,20";
const worldTiles = (waystation: DomainTileState["waystation"]): DomainTileState[] => {
  const tiles: DomainTileState[] = [];
  for (let y = 0; y <= 40; y += 1) {
    for (let x = 0; x <= 60; x += 1) {
      const owned = y === 20 && x >= 10 && x <= 14;
      const rival = y === 20 && x >= 29 && x <= 31;
      tiles.push({
        x,
        y,
        terrain: "LAND",
        ...(owned ? { ownerId: "player-1", ownershipState: "SETTLED" as const } : {}),
        ...(rival ? { ownerId: "rival-1", ownershipState: "SETTLED" as const } : {}),
        ...(owned && x === 14 ? { waystation } : {}),
        ...(rival && x === 30 ? { town: { name: "Celenorvale Crossing" } as DomainTileState["town"] } : {})
      });
    }
  }
  return tiles;
};

const runtimeWith = (tiles: DomainTileState[], now: () => number): SimulationRuntime =>
  new SimulationRuntime({
    now,
    initialPlayers: new Map([["player-1", humanPlayer("player-1")], ["rival-1", humanPlayer("rival-1")]]),
    seedTiles: new Map(),
    initialState: { tiles, activeLocks: [] }
  });

const sees = (runtime: SimulationRuntime, key: string): boolean =>
  runtime.exportVisibleStateForPlayer("player-1").tiles.some((tile) => `${tile.x},${tile.y}` === key);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("waystation VISION reward", () => {
  it("gives a one-time look at the nearby town that drops back to fog when it expires", async () => {
    let now = 1_000;
    const seen: SimulationEvent[] = [];
    const runtime = runtimeWith(worldTiles({ activated: false }), () => now);
    runtime.onEvent((event) => seen.push(event));
    expect(sees(runtime, RIVAL_TOWN)).toBe(false);

    vi.spyOn(Math, "random").mockReturnValue(0.05); // effect roll 0 = VISION
    runtime.submitCommand({ commandId: "activate-1", sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: now, type: "ACTIVATE_WAYSTATION", payloadJson: JSON.stringify({ x: 14, y: 20 }) });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(seen.find((event) => event.eventType === "COMMAND_REJECTED")).toBeUndefined();
    expect(sees(runtime, RIVAL_TOWN)).toBe(true);

    now += WAYSTATION_VISION_REVEAL_TTL_MS - 1;
    runtime.tickWatchtowerReveals(now);
    expect(sees(runtime, RIVAL_TOWN)).toBe(true);

    now += 1;
    runtime.tickWatchtowerReveals(now);
    expect(sees(runtime, RIVAL_TOWN)).toBe(false);
    // The expiry flushes the FOG edges itself, so the client freezes the town as remembered land now.
    expect(seen.some((event) => event.eventType === "TILE_DELTA_BATCH" && event.commandId.startsWith("waystation-vision-expire:14,20:"))).toBe(true);
  });

  it("does not restore sight of the town after a restart", () => {
    const runtime = runtimeWith(
      worldTiles({ activated: true, activatedByPlayerId: "player-1", activatedAt: 0, grantedEffect: "VISION", revealedAtX: 30, revealedAtY: 20 }),
      () => 1_000
    );
    expect(sees(runtime, RIVAL_TOWN)).toBe(false);
  });
});
