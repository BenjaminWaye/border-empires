import { describe, expect, it } from "vitest";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainTileState } from "@border-empires/game-domain";
import type { ScoutDronePayload } from "@border-empires/shared";
import { SimulationRuntime } from "../runtime/runtime.js";

// End-to-end through the real runtime: EXPLORE is dispatched, the drone's
// vision lifts the fog along its flight (the same coverage the client's fog
// and Planetary Defense wake-up read), then it lands and files a report.
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

// Land rows 15..25 from x 0..60; player-1 holds x 10..14 on row 20 with its AFC at (12, 20).
const worldTiles = (): DomainTileState[] => {
  const tiles: DomainTileState[] = [];
  for (let y = 15; y <= 25; y += 1) {
    for (let x = 0; x <= 60; x += 1) {
      const owned = y === 20 && x >= 10 && x <= 14;
      tiles.push({
        x,
        y,
        terrain: "LAND",
        ...(owned ? { ownerId: "player-1", ownershipState: "SETTLED" as const } : {}),
        ...(owned && x === 12 ? { afc: { ownerId: "player-1", status: "active" as const } } : {})
      });
    }
  }
  return tiles;
};

const visibleKeys = (runtime: SimulationRuntime): Set<string> =>
  new Set(runtime.exportVisibleStateForPlayer("player-1").tiles.map((tile) => `${tile.x},${tile.y}`));

describe("Explore in the runtime", () => {
  it("lifts the fog along the drone's flight, then lands and reports", async () => {
    let now = 1_000;
    const seen: SimulationEvent[] = [];
    const runtime = new SimulationRuntime({
      now: () => now,
      initialPlayers: new Map([["player-1", humanPlayer("player-1")]]),
      seedTiles: new Map(),
      initialState: { tiles: worldTiles(), activeLocks: [] }
    });
    runtime.onEvent((event) => seen.push(event));
    expect(visibleKeys(runtime).has("30,20")).toBe(false);

    runtime.submitCommand({ commandId: "explore-1", sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: now, type: "EXPLORE", payloadJson: JSON.stringify({ x: 40, y: 20 }) });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(seen.find((event) => event.eventType === "COMMAND_REJECTED")).toBeUndefined();
    const launched = seen.find((event) => event.eventType === "PLAYER_MESSAGE" && event.messageType === "SCOUT_DRONE");
    const flight = launched?.eventType === "PLAYER_MESSAGE" ? (JSON.parse(launched.payloadJson) as ScoutDronePayload).flight : null;
    expect(flight?.steps[0]).toMatchObject({ x: 12, y: 20 });

    // Over (28, 20): radius-3 vision reaches (30, 20).
    const over28 = flight!.steps.find((step) => step.x === 28)!;
    now = over28.at;
    runtime.tickWatchtowerReveals(now);
    expect(visibleKeys(runtime).has("30,20")).toBe(true);

    now = flight!.landsAt;
    runtime.tickWatchtowerReveals(now);
    expect(visibleKeys(runtime).has("30,20")).toBe(false);
    const landed = seen.filter((event) => event.eventType === "PLAYER_MESSAGE" && event.messageType === "SCOUT_DRONE").at(-1);
    const payload = landed?.eventType === "PLAYER_MESSAGE" ? (JSON.parse(landed.payloadJson) as ScoutDronePayload) : undefined;
    expect(payload?.flight).toBeNull();
    expect(payload?.report).toMatchObject({ targetX: 40, targetY: 20 });
  });
});
