// Regressions from review: the Send scout drone pick must be the only armed
// map pick, and Escape must take its card down.
import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { beginCrystalTargeting } from "../client-tile-action-logic/client-crystal-targeting.js";
import { cancelArmedModesOnEscape } from "../client-map-input/client-map-input-escape.js";
import { dispatchAfcScoutAction } from "./client-scout-drone-picking.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

describe("Send scout drone and the other map picks", () => {
  it("arming the scout pick disarms Crystal targeting and march picking", () => {
    const state = createInitialState();
    state.crystalTargeting.active = true;
    state.aetherWallTargeting.active = true;
    state.marchOriginPicking = { active: true, targetX: 3, targetY: 3 };
    state.musterMarchTargeting = { active: true, originX: 1, originY: 1 };
    dispatchAfcScoutAction("afc_scout_drone", state, { pushFeed: vi.fn() }, 0);
    expect(state.scoutDronePicking.active).toBe(true);
    expect(state.crystalTargeting.active).toBe(false);
    expect(state.aetherWallTargeting.active).toBe(false);
    expect(state.marchOriginPicking.active).toBe(false);
    expect(state.musterMarchTargeting.active).toBe(false);
  });

  it("arming Aether Wall disarms a waiting scout pick", () => {
    const state = createInitialState();
    state.me = "me";
    state.localhostDevAetherWall = true;
    for (let x = 4; x <= 6; x += 1) {
      for (let y = 4; y <= 6; y += 1) {
        state.tiles.set(keyFor(x, y), { x, y, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" } as Tile);
      }
    }
    state.scoutDronePicking.active = true;
    const deps = {
      keyFor,
      parseKey: (k: string) => ({ x: Number(k.split(",")[0]), y: Number(k.split(",")[1]) }),
      wrapX: (x: number) => x,
      wrapY: (y: number) => y,
      terrainAt: () => "LAND" as const,
      isTileOwnedByAlly: () => false,
      hostileObservatoryProtectingTile: () => undefined,
      activeTruceWithPlayer: () => undefined,
      abilityCooldownRemainingMs: () => 0,
      formatCooldownShort: () => "",
      pushFeed: vi.fn(),
      hideTileActionMenu: () => undefined,
      selectedTile: () => undefined,
      renderHud: () => undefined
    } as never;
    beginCrystalTargeting(state, "aether_wall", deps);
    expect(state.aetherWallTargeting.active).toBe(true);
    expect(state.scoutDronePicking.active).toBe(false);
  });

  it("Escape disarms the scout pick before the HUD re-renders", () => {
    const state = createInitialState();
    state.scoutDronePicking.active = true;
    let armedAtRender: boolean | undefined;
    cancelArmedModesOnEscape(state, {
      cancelOngoingCapture: vi.fn(),
      hideTileActionMenu: vi.fn(),
      clearCrystalTargeting: vi.fn(),
      cancelBuildingPlacement: () => {
        armedAtRender = state.scoutDronePicking.active;
      }
    });
    expect(armedAtRender).toBe(false);
    expect(state.scoutDronePicking.active).toBe(false);
  });
});
