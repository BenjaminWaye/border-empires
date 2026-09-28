import type { DomainTileState } from "@border-empires/game-domain";
import { WAYSTATION_MANPOWER_GRANT } from "@border-empires/shared";
import { describe, expect, it } from "vitest";
import { activateWaystationAt } from "./runtime-waystation-activation.js";
import { PLAYER_ID, RANDOM_FOR, WAYSTATION_KEY, createInput, makePlayer, queueRandom, waystationTile } from "./runtime-waystation-activation.test-helpers.js";
import { rollWaystationGoldTier } from "./runtime-waystation-rewards.js";

describe("rollWaystationGoldTier", () => {
  // Weights 50/35/15 over a total of 100: [0, 0.5) SMALL, [0.5, 0.85) MEDIUM, [0.85, 1) LARGE.
  it.each([
    [0, "SMALL", 25],
    [0.49, "SMALL", 25],
    [0.5, "MEDIUM", 50],
    [0.84, "MEDIUM", 50],
    [0.85, "LARGE", 100],
    [0.999, "LARGE", 100]
  ] as const)("random %s -> %s (%s gold)", (roll, tier, amount) => {
    expect(rollWaystationGoldTier(() => roll)).toEqual({ tier, amount });
  });
});

describe("activateWaystationAt GOLD / MANPOWER rewards", () => {
  it("GOLD effect adds the rolled tier to the treasury and records it everywhere", () => {
    const tiles = new Map<string, DomainTileState>([[WAYSTATION_KEY, waystationTile()]]);
    const players = new Map([[PLAYER_ID, makePlayer({ points: 10 })]]);
    const { input, impacts } = createInput(tiles, players, queueRandom([RANDOM_FOR.GOLD, 0.9]));

    activateWaystationAt(input, WAYSTATION_KEY, 10, 10, PLAYER_ID, "cmd-gold");

    const player = players.get(PLAYER_ID)!;
    expect(player.points).toBe(110);
    expect(tiles.get(WAYSTATION_KEY)?.waystation).toMatchObject({ activated: true, grantedEffect: "GOLD", grantedGold: 100, grantedGoldTier: "LARGE" });
    expect(player.eventLog?.at(-1)).toMatchObject({ type: "WAYSTATION_ACTIVATED", grantedEffect: "GOLD", grantedGold: 100, grantedGoldTier: "LARGE" });
    expect(impacts).toEqual([expect.objectContaining({ grantedEffect: "GOLD", grantedGold: 100, grantedGoldTier: "LARGE" })]);
  });

  it("MANPOWER effect grants the full amount even when it overflows the cap", () => {
    const tiles = new Map<string, DomainTileState>([[WAYSTATION_KEY, waystationTile()]]);
    const players = new Map([[PLAYER_ID, makePlayer({ manpower: 700 })]]);
    const { input } = createInput(tiles, players, queueRandom([RANDOM_FOR.MANPOWER]), new Set(), 720);

    activateWaystationAt(input, WAYSTATION_KEY, 10, 10, PLAYER_ID, "cmd-manpower");

    const player = players.get(PLAYER_ID)!;
    expect(player.manpower).toBe(700 + WAYSTATION_MANPOWER_GRANT);
    expect(player.waystationManpowerOverflow).toBe(700 + WAYSTATION_MANPOWER_GRANT - 720);
    expect(tiles.get(WAYSTATION_KEY)?.waystation).toMatchObject({ grantedEffect: "MANPOWER", grantedManpower: WAYSTATION_MANPOWER_GRANT });
    expect(player.eventLog?.at(-1)).toMatchObject({ grantedEffect: "MANPOWER", grantedManpower: WAYSTATION_MANPOWER_GRANT });
  });

  it("MANPOWER effect settles regen before granting", () => {
    const tiles = new Map<string, DomainTileState>([[WAYSTATION_KEY, waystationTile()]]);
    const players = new Map([[PLAYER_ID, makePlayer({ manpower: 100 })]]);
    const { input } = createInput(tiles, players, queueRandom([RANDOM_FOR.MANPOWER]), new Set(), 5_000);
    const refreshed: string[] = [];
    input.refreshManpower = (playerId) => {
      refreshed.push(playerId);
      players.get(playerId)!.manpower = 300;
    };

    activateWaystationAt(input, WAYSTATION_KEY, 10, 10, PLAYER_ID, "cmd-manpower-regen");

    expect(refreshed).toEqual([PLAYER_ID]);
    expect(players.get(PLAYER_ID)!.manpower).toBe(300 + WAYSTATION_MANPOWER_GRANT);
    // Still under a 5,000 cap: no overflow allowance recorded.
    expect(players.get(PLAYER_ID)!.waystationManpowerOverflow).toBeUndefined();
  });
});
