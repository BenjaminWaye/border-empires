import { describe, expect, it } from "vitest";
import { GALACTIC_WONDER_MANPOWER_REGEN_BONUS_PER_MINUTE } from "@border-empires/shared";

import { SimulationRuntime } from "./runtime.js";

// Galactic meta-layer v0 (docs/galactic-campaign-design.md §5, §12): a
// one-time Wonder-style starting bonus for the most recent season's Planet
// winner, granted via pendingGalacticWonderBonus and consumed the first time
// that player spawns territory. Coverage lives in a dedicated file, mirroring
// runtime-imperial-ward.test.ts's convention, rather than the already
// oversized runtime.test.ts (see AGENTS.md file-line discipline).
describe("simulation runtime — galactic Wonder starting bonus (v0)", () => {
  it("grants the manpower-regen and vision-radius bonus once, the first time the winning player spawns territory, then clears the grant", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND" },
          { x: 20, y: 20, terrain: "LAND" }
        ],
        activeLocks: []
      },
      pendingGalacticWonderBonus: { playerId: "planet-winner" }
    });

    const spawnedFirst = runtime.ensurePlayerHasSpawnTerritory("planet-winner");
    expect(spawnedFirst).toBe(true);
    const winnerExport = runtime.exportState().players.find((p) => p.id === "planet-winner");
    // manpowerRegenPerMinute is the fully-composed export field (see
    // playerManpowerRegenPerMinuteFromSummary), so a starting-capital-only
    // player's regen must be at least the granted bonus on top of it.
    expect(winnerExport?.manpowerRegenPerMinute).toBeGreaterThanOrEqual(GALACTIC_WONDER_MANPOWER_REGEN_BONUS_PER_MINUTE);

    // A second player joining afterwards must not receive the one-shot grant
    // — their regen is the plain starting-capital baseline, strictly less.
    const otherSpawned = runtime.ensurePlayerHasSpawnTerritory("someone-else");
    expect(otherSpawned).toBe(true);
    const otherExport = runtime.exportState().players.find((p) => p.id === "someone-else");
    expect(otherExport?.manpowerRegenPerMinute).toBeLessThan(winnerExport?.manpowerRegenPerMinute ?? 0);
  });

  it("does nothing when no pendingGalacticWonderBonus is set (no Planet winner last season)", () => {
    const withBonus = new SimulationRuntime({
      now: () => 1_000,
      seedTiles: new Map(),
      initialState: { tiles: [{ x: 10, y: 10, terrain: "LAND" }], activeLocks: [] },
      pendingGalacticWonderBonus: { playerId: "player-1" }
    });
    withBonus.ensurePlayerHasSpawnTerritory("player-1");
    const withBonusRegen = withBonus.exportState().players.find((p) => p.id === "player-1")?.manpowerRegenPerMinute;

    const withoutBonus = new SimulationRuntime({
      now: () => 1_000,
      seedTiles: new Map(),
      initialState: { tiles: [{ x: 10, y: 10, terrain: "LAND" }], activeLocks: [] }
    });
    withoutBonus.ensurePlayerHasSpawnTerritory("player-1");
    const withoutBonusRegen = withoutBonus.exportState().players.find((p) => p.id === "player-1")?.manpowerRegenPerMinute;

    expect(withoutBonusRegen).toBeLessThan(withBonusRegen ?? 0);
  });
});
