/**
 * Regression: a restart moved resource-slot dormancy onto a different
 * structure. Dormancy sleeps the NEWEST food consumers first and dates each
 * town by Runtime.tileSettledAtByKey, which was never saved -- so after a
 * restart every town looked oldest and a food shortfall that a freshly settled
 * town used to absorb landed on the Ancillary Depot instead. The manpower cap
 * dropped at boot, and its later recovery was paid out as free manpower.
 */
import { describe, expect, it } from "vitest";

import { SimulationRuntime } from "./runtime.js";
import { buildPlayer } from "./runtime.test-helpers.js";

const PLAYER_ID = "town-settled-at-restart-player";
const NEW_TOWN_KEY = "12,10";
const DEPOT_KEY = "11,10";

type RuntimeInternals = {
  replaceTileState: (tileKey: string, tile: unknown) => void;
  state: { tiles: Map<string, Record<string, unknown>> };
};

const buildLiveRuntime = (now: () => number): SimulationRuntime =>
  new SimulationRuntime({
    now,
    seedTiles: new Map(),
    initialPlayers: new Map([
      [PLAYER_ID, buildPlayer(PLAYER_ID, { points: 100_000, manpower: 400, manpowerUpdatedAt: now(), strategicResources: { FOOD: 1_000, CRYSTAL: 1_000 } })]
    ]),
    initialState: {
      tiles: [
        { x: 10, y: 10, terrain: "LAND", ownerId: PLAYER_ID, ownershipState: "SETTLED", town: { name: "Capital", type: "MARKET", populationTier: "SETTLEMENT", goldPerMinute: 1 } },
        { x: 11, y: 10, terrain: "LAND", ownerId: PLAYER_ID, ownershipState: "SETTLED", economicStructure: { ownerId: PLAYER_ID, type: "ANCILLARY_DEPOT", status: "active", activatedAt: 500 } },
        { x: 12, y: 10, terrain: "LAND", ownerId: PLAYER_ID, ownershipState: "FRONTIER", town: { name: "Newtown", type: "MARKET", populationTier: "TOWN", goldPerMinute: 1 } },
        // One farm: enough FOOD for the depot, not for the depot plus the new town.
        { x: 20, y: 10, terrain: "LAND", ownerId: PLAYER_ID, ownershipState: "SETTLED", resource: "FARM" }
      ],
      activeLocks: []
    }
  });

describe("town settle stamps across a restart", () => {
  it("keeps the same structures dormant, so the manpower cap does not drop at boot", () => {
    let now = 1_000_000;
    const live = buildLiveRuntime(() => now);
    const internals = live as unknown as RuntimeInternals;
    now += 60_000;
    internals.replaceTileState(NEW_TOWN_KEY, { ...internals.state.tiles.get(NEW_TOWN_KEY), ownershipState: "SETTLED" });
    now += 60_000;

    const livePlayer = live.exportState().players.find((player) => player.id === PLAYER_ID)!;
    // The freshly settled town is the newest food consumer, so it sleeps and the depot stays active.
    expect(live.dormantEconomicStructureKeysForPlayer(PLAYER_ID).has(DEPOT_KEY)).toBe(false);

    const snapshot = live.exportSnapshotSections().initialState;
    expect(snapshot.players?.find((player) => player.id === PLAYER_ID)?.townSettledAt).toEqual([
      { tileKey: NEW_TOWN_KEY, settledAt: 1_060_000 }
    ]);

    const restarted = new SimulationRuntime({ now: () => now + 1_000, seedTiles: new Map(), initialState: snapshot });
    const restartedPlayer = restarted.exportState().players.find((player) => player.id === PLAYER_ID)!;
    expect(restarted.dormantEconomicStructureKeysForPlayer(PLAYER_ID).has(DEPOT_KEY)).toBe(false);
    expect(restartedPlayer.manpowerCap).toBe(livePlayer.manpowerCap);
    expect(restartedPlayer.manpower).toBe(livePlayer.manpower);
  });
});
