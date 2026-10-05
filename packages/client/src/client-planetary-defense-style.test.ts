import { describe, expect, it, vi } from "vitest";
import { syncBattleOverlayFx } from "./client-map-3d-capture-overlays.js";
import { PLANETARY_DEFENSE_ARMOR_COLOR, squadColorForOwner } from "./client-planetary-defense-style.js";
import type { BattleOverlayRenderEntry } from "./client-map-3d-popup-marine/popup-marine-overlay-fx.js";
import type { ClientState } from "./client-state/client-state.js";

describe("squadColorForOwner", () => {
  it("dresses Planetary Defense in its dark grey armor and everyone else in their own color", () => {
    const colorFor = (id: string): string => `#${id}`;
    expect(squadColorForOwner("barbarian-1", colorFor)).toBe(PLANETARY_DEFENSE_ARMOR_COLOR);
    expect(squadColorForOwner("barbarian", colorFor)).toBe(PLANETARY_DEFENSE_ARMOR_COLOR);
    expect(squadColorForOwner("player-1", colorFor)).toBe("#player-1");
  });
});

describe("syncBattleOverlayFx with Planetary Defense", () => {
  it("renders the Planetary Defense side of a battle as the same dark-grey-armored soldiers that patrol its tiles", () => {
    const now = performance.now();
    const state = {
      me: "player-1",
      camX: 0,
      camY: 0,
      tiles: new Map(),
      activeBattles: new Map([
        [
          "5,5",
          {
            originX: 4, originY: 5, targetX: 5, targetY: 5,
            attackerOwnerId: "barbarian-1", defenderOwnerId: "player-1", attackerWon: false,
            startAt: now, clashAt: now, endAt: now + 60_000, fromSkirmish: false
          }
        ]
      ]),
      incomingAttacksByTile: new Map(),
      outgoingMusterAttacksByTile: new Map(),
      skirmishSeenAt: new Map(),
      capture: undefined
    } as unknown as ClientState;
    const tick = vi.fn<(nowMs: number, battles: BattleOverlayRenderEntry[]) => void>();
    const fx = { tick, clear: vi.fn(), dispose: vi.fn() } as never;
    const heightfield = { elevationAt: () => 0, cornerYAt: () => 0 } as never;

    syncBattleOverlayFx(state, (x, y) => `${x},${y}`, heightfield, (id) => `#${id}`, fx, now, 0, 0);

    expect(tick.mock.calls[0]?.[1]).toEqual([
      expect.objectContaining({ attackerColor: PLANETARY_DEFENSE_ARMOR_COLOR, defenderColor: "#player-1" })
    ]);
  });
});
