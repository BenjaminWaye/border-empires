import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "./runtime.js";
import { afcModuleFixtureTile, buildPlayer } from "./runtime.test-helpers.js";

// A Relay Beacon covers its whole reach disk with FRONTIER every time it is
// built. Reported live: neutral land that was already inside the player's
// reach (here: the home town's radius-3 disk, never claimed) stayed neutral
// when a beacon went up over it -- only ground that newly entered reach was
// claimed -- so the only way to own it was a manual Expand, tile by tile.

type ExportedTile = { x: number; y: number; ownerId?: string; ownershipState?: string };

const buildRuntime = (scheduled: Array<() => void>) => {
  const tiles: Array<Record<string, unknown>> = [];
  for (let y = 0; y <= 20; y += 1) {
    for (let x = 0; x <= 24; x += 1) {
      if (x === 1 && y === 1) tiles.push(afcModuleFixtureTile("player-1"));
      else if (x === 10 && y === 10) tiles.push({ x, y, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" } });
      else if (x === 13 && y === 10) tiles.push({ x, y, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" });
      else tiles.push({ x, y, terrain: "LAND" });
    }
  }
  return new SimulationRuntime({
    now: () => 1_000,
    scheduleAfter: (_delayMs, task) => { scheduled.push(task); },
    initialPlayers: new Map([["player-1", buildPlayer("player-1", { points: 20_000, manpower: 10_000 })]]),
    initialState: { tiles: tiles as never, activeLocks: [] }
  });
};

const tileAt = (runtime: SimulationRuntime, x: number, y: number): ExportedTile | undefined =>
  (runtime.exportState().tiles as ExportedTile[]).find((t) => t.x === x && t.y === y);

describe("Relay Beacon build claims its reach disk", () => {
  it("claims neutral land already inside the player's reach, not only newly reached ground", async () => {
    const scheduled: Array<() => void> = [];
    const runtime = buildRuntime(scheduled);
    // (12,9) sits inside the home town's reach before the beacon and is still neutral.
    expect(runtime.reachTileKeysForPlayer("player-1")).toContain("12,9");
    expect(tileAt(runtime, 12, 9)?.ownerId).toBeUndefined();

    runtime.submitCommand({
      commandId: "build-beacon",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "BUILD_ECONOMIC_STRUCTURE",
      payloadJson: JSON.stringify({ x: 13, y: 10, structureType: "RELAY_BEACON" })
    });
    await Promise.resolve();
    for (const task of scheduled.splice(0)) task(); // command dispatch
    await Promise.resolve();

    // Ground the beacon newly brought into reach...
    expect(tileAt(runtime, 18, 10)).toMatchObject({ ownerId: "player-1", ownershipState: "FRONTIER" });
    // ...and neutral ground that was already in reach, inside the beacon's disk.
    expect(tileAt(runtime, 12, 9)).toMatchObject({ ownerId: "player-1", ownershipState: "FRONTIER" });
    expect(tileAt(runtime, 8, 10)).toMatchObject({ ownerId: "player-1", ownershipState: "FRONTIER" });
    // Outside the beacon's disk (x < 8) the town-only reach is left for Expand.
    expect(tileAt(runtime, 7, 10)?.ownerId).toBeUndefined();
  });
});
