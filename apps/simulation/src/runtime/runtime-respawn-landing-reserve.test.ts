import { describe, expect, it } from "vitest";
import { LANDING_MANPOWER_RESERVE, MANPOWER_REFILL_WINDOW_MS } from "@border-empires/shared";
import { STARTING_CAPITAL_MANPOWER_CAP, STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE, type DomainTileState } from "@border-empires/game-domain";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer } from "./runtime.test-helpers.js";
import { simulationTileKey } from "../seed-state/seed-state.js";

const NOW = 40 * MANPOWER_REFILL_WINDOW_MS + 5_000_000;
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

const landTiles = (): DomainTileState[] => {
  const tiles: DomainTileState[] = [];
  for (let y = 0; y <= 20; y += 1) for (let x = 0; x <= 20; x += 1) tiles.push({ x, y, terrain: "LAND" });
  return tiles;
};

// A veteran (already past their first landing) who is eliminated and
// respawns lands anew: same one-time reserve a brand-new empire gets, plus the
// late-join catch-up, so a last-minute comeback is a real option.
const respawnedVeteran = (seasonStartedAt: (() => number | undefined) | undefined) => {
  const runtime = new SimulationRuntime({
    now: () => NOW,
    ...(seasonStartedAt ? { seasonStartedAt } : {}),
    initialPlayers: new Map([["veteran", buildPlayer("veteran", { manpower: 12, manpowerUpdatedAt: NOW - 3 * MINUTE, manpowerCapSnapshot: STARTING_CAPITAL_MANPOWER_CAP, landingReserveGranted: true })]]),
    seedTiles: new Map(landTiles().map((tile) => [simulationTileKey(tile.x, tile.y), tile])),
    initialState: { tiles: landTiles(), activeLocks: [] }
  });
  (runtime as unknown as { respawnIfEliminated(playerId: string, commandId: string): void }).respawnIfEliminated("veteran", "eliminated-1");
  return runtime;
};

const manpowerOf = (runtime: SimulationRuntime): number => runtime.exportState().players.find((player) => player.id === "veteran")?.manpower ?? Number.NaN;

// The respawned AFC raises the cap, and growing the cap credits the same
// amount of manpower (as for any new empire), so the reserve is measured
// against the cap the player ends up with.
const capOf = (runtime: SimulationRuntime): number => {
  const probe = runtime as unknown as { playerManpowerCap(player: unknown): number; state: { players: Map<string, unknown> } };
  return probe.playerManpowerCap(probe.state.players.get("veteran"));
};

describe("respawn landing reserve", () => {
  it("lands a respawned empire with the base reserve on top of the starting manpower", () => {
    const runtime = respawnedVeteran(() => undefined);
    expect(manpowerOf(runtime)).toBe(capOf(runtime) + LANDING_MANPOWER_RESERVE);
    expect(manpowerOf(runtime)).toBeGreaterThanOrEqual(STARTING_CAPITAL_MANPOWER_CAP + LANDING_MANPOWER_RESERVE);
  });

  it("adds the late-join catch-up for a respawn deep into the season", () => {
    const runtime = respawnedVeteran(() => NOW - 25 * DAY);
    const catchUp = Math.floor(25 * 24 * 60 * STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE);
    expect(catchUp).toBe(14_400);
    expect(manpowerOf(runtime)).toBe(capOf(runtime) + LANDING_MANPOWER_RESERVE + catchUp);
  });
});
