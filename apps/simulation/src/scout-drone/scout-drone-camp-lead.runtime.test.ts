import { describe, expect, it } from "vitest";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainTileState } from "@border-empires/game-domain";
import { SimulationRuntime } from "../runtime/runtime.js";
import { SCOUT_CAMP_LEAD_REVEAL_TTL_MS } from "./scout-drone-camp-lead.js";

// End-to-end through the real runtime (runtime.ts wires the live camp index in):
// PLAYER_UPDATE names the camp lead, an ordinary EXPLORE shows no camp, the
// guide's flight to the lead lifts the fog off the camp, and the look ends
// after its TTL, leaving the camp explored.
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

// Land rows 15..25 from x 0..60; player-1 holds x 10..14 on row 20 with its AFC at (12, 20);
// an Insurgent camp at (40, 22), 28 tiles out, with a frontier tile beside it.
const worldTiles = (): DomainTileState[] => {
  const tiles: DomainTileState[] = [];
  for (let y = 15; y <= 25; y += 1) {
    for (let x = 0; x <= 60; x += 1) {
      const owned = y === 20 && x >= 10 && x <= 14;
      const isCamp = x === 40 && y === 22;
      const campLand = x === 41 && y === 22;
      tiles.push({
        x,
        y,
        terrain: "LAND",
        ...(owned ? { ownerId: "player-1", ownershipState: "SETTLED" as const } : {}),
        ...(owned && x === 12 ? { afc: { ownerId: "player-1", status: "active" as const } } : {}),
        ...(isCamp ? { ownerId: "barbarian-1", ownershipState: "SETTLED" as const, campId: "40,22" } : {}),
        ...(campLand ? { ownerId: "barbarian-1", ownershipState: "FRONTIER" as const, campId: "40,22" } : {})
      });
    }
  }
  return tiles;
};

const visibleKeys = (runtime: SimulationRuntime): Set<string> =>
  new Set(runtime.exportVisibleStateForPlayer("player-1").tiles.map((tile) => `${tile.x},${tile.y}`));

const newRuntime = (clock: { now: number }, seen: SimulationEvent[]): SimulationRuntime => {
  const runtime = new SimulationRuntime({
    now: () => clock.now,
    initialPlayers: new Map([["player-1", humanPlayer("player-1")]]),
    seedTiles: new Map(),
    initialState: { tiles: worldTiles(), activeLocks: [] }
  });
  runtime.onEvent((event) => seen.push(event));
  return runtime;
};

const explore = (runtime: SimulationRuntime, commandId: string, now: number, stops: Array<{ x: number; y: number }>): void =>
  runtime.submitCommand({ commandId, sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: now, type: "EXPLORE", payloadJson: JSON.stringify({ ...stops[0], waypoints: stops }) });

const lastCampLead = (seen: SimulationEvent[]): unknown => {
  const update = seen
    .filter((event): event is Extract<SimulationEvent, { eventType: "PLAYER_MESSAGE" }> => event.eventType === "PLAYER_MESSAGE" && event.messageType === "PLAYER_UPDATE" && event.playerId === "player-1")
    .at(-1);
  return update ? (JSON.parse(update.payloadJson) as { guideCampLead?: unknown }).guideCampLead : "no PLAYER_UPDATE";
};

// The client's lead route from the AFC at (12, 20) to the camp at (40, 22): two legs (client-scout-drone-lead-route.ts).
const GUIDED = [{ x: 26, y: 21 }, { x: 40, y: 22 }];

describe("guide camp lead in the runtime", () => {
  it("names the camp on PLAYER_UPDATE; an ordinary Explore shows no camp", async () => {
    const clock = { now: 100_000 };
    const seen: SimulationEvent[] = [];
    const runtime = newRuntime(clock, seen);
    runtime.applyPassiveIncome(clock.now - 15_000, Number.MAX_SAFE_INTEGER);
    runtime.applyPassiveIncome(clock.now, Number.MAX_SAFE_INTEGER);
    expect(lastCampLead(seen)).toEqual({ x: 40, y: 22 });

    // A short flight the other way: the drone never comes near the camp, and the camp stays in fog.
    explore(runtime, "explore-1", clock.now, [{ x: 5, y: 20 }]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(seen.find((event) => event.eventType === "COMMAND_REJECTED")).toBeUndefined();
    expect(visibleKeys(runtime).has("40,22")).toBe(false);
  });

  it("the guided flight shows the camp, then lets it drop back to fog, and the lead clears", async () => {
    const clock = { now: 1_000 };
    const seen: SimulationEvent[] = [];
    const runtime = newRuntime(clock, seen);
    expect(visibleKeys(runtime).has("40,22")).toBe(false);

    explore(runtime, "explore-camp", clock.now, GUIDED);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(seen.find((event) => event.eventType === "COMMAND_REJECTED")).toBeUndefined();
    const visible = visibleKeys(runtime);
    expect(visible.has("40,22")).toBe(true);
    expect(visible.has("41,23")).toBe(true);

    clock.now += SCOUT_CAMP_LEAD_REVEAL_TTL_MS;
    runtime.tickWatchtowerReveals(clock.now);
    expect(visibleKeys(runtime).has("40,22")).toBe(false);
    runtime.applyPassiveIncome(clock.now, Number.MAX_SAFE_INTEGER);
    expect(lastCampLead(seen)).toBeNull();
  });
});
