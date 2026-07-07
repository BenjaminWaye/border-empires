import { describe, expect, it } from "vitest";

import {
  drawPersistentAlertLocators,
  nearestPersistentAlerts,
  notificationCategoryForServerError,
  type PersistentAlertLocator,
  persistentAlertLocatorAt,
  persistentAlertsForState
} from "./client-persistent-alerts.js";
import type { Tile } from "../client-types.js";

type TileOverrides = Omit<Partial<Tile>, "town"> & { town?: Partial<NonNullable<Tile["town"]>> };

const unfedTownTile = (overrides: TileOverrides = {}): Tile => {
  const { town: townOverrides, ...tileOverrides } = overrides;
  return {
    x: 12,
    y: 18,
    terrain: "LAND",
    ownerId: "me",
    ownershipState: "SETTLED",
    ...tileOverrides,
    town: {
    type: "FARMING",
    name: "Ravenhold",
    baseGoldPerMinute: 1,
    supportCurrent: 0,
    supportMax: 4,
    goldPerMinute: 0,
    cap: 0,
    isFed: false,
    population: 25_000,
    maxPopulation: 100_000,
    populationGrowthPerMinute: 0,
    populationTier: "TOWN",
    connectedTownCount: 0,
    connectedTownBonus: 0,
    hasMarket: false,
    marketActive: false,
    hasGranary: false,
    granaryActive: false,
    hasBank: false,
    bankActive: false,
      ...townOverrides
    }
  }
};

const musterTile = (overrides: Omit<Partial<Tile>, "muster"> & { muster?: Partial<NonNullable<Tile["muster"]>> } = {}): Tile => {
  const { muster: musterOverrides, ...tileOverrides } = overrides;
  return {
    x: 30,
    y: 40,
    terrain: "LAND",
    ownerId: "me",
    ownershipState: "SETTLED",
    ...tileOverrides,
    muster: {
      ownerId: "me",
      amount: 120,
      mode: "HOLD",
      updatedAt: 0,
      ...musterOverrides
    }
  };
};

describe("persistent alerts", () => {
  it("classifies ongoing town food failures as persistent alerts", () => {
    expect(notificationCategoryForServerError("TOWN_UNFED")).toBe("persistent_alert");
    expect(notificationCategoryForServerError("ATTACK_COOLDOWN")).toBe("action_feedback");
  });

  it("creates a persistent alert only for owned unresolved unfed towns", () => {
    const state = {
      me: "me",
      tiles: new Map<string, Tile>([
        ["12,18", unfedTownTile()],
        ["20,22", unfedTownTile({ x: 20, y: 22, ownerId: "enemy" })],
        ["24,25", unfedTownTile({ x: 24, y: 25, town: { isFed: true } })]
      ])
    };

    expect(persistentAlertsForState(state)).toEqual([
      expect.objectContaining({
        id: "town_unfed:12,18",
        kind: "town_unfed",
        title: "Town unfed",
        detail: "Ravenhold needs FOOD upkeep.",
        x: 12,
        y: 18
      })
    ]);
  });

  it("creates a persistent alert for an owned active muster flag", () => {
    const state = {
      me: "me",
      tiles: new Map<string, Tile>([["30,40", musterTile()]])
    };

    expect(persistentAlertsForState(state)).toEqual([
      expect.objectContaining({
        id: "muster_active:30,40",
        kind: "muster_active",
        title: "Muster flag active",
        x: 30,
        y: 40
      })
    ]);
  });

  it("ignores a muster flag owned by another player even on our own tile", () => {
    const state = {
      me: "me",
      tiles: new Map<string, Tile>([["30,40", musterTile({ muster: { ownerId: "enemy" } })]])
    };

    expect(persistentAlertsForState(state)).toEqual([]);
  });

  it("shows both HOLD and ADVANCE muster flags", () => {
    const state = {
      me: "me",
      tiles: new Map<string, Tile>([
        ["30,40", musterTile({ x: 30, y: 40, muster: { mode: "HOLD" } })],
        ["31,40", musterTile({ x: 31, y: 40, muster: { mode: "ADVANCE", targetX: 35, targetY: 40 } })]
      ])
    };

    const alerts = persistentAlertsForState(state);
    expect(alerts.map((alert) => alert.id).sort()).toEqual(["muster_active:30,40", "muster_active:31,40"]);
  });

  it("orders locator candidates by distance from the camera", () => {
    const alerts = [
      { id: "far", kind: "town_unfed" as const, title: "Town unfed", detail: "Far", x: 40, y: 40, severity: "warn" as const },
      { id: "near", kind: "town_unfed" as const, title: "Town unfed", detail: "Near", x: 11, y: 10, severity: "warn" as const }
    ];
    const sorted = nearestPersistentAlerts(
      alerts,
      { camX: 10, camY: 10 },
      { worldWidth: 450, worldHeight: 450, toroidDelta: (_from, to) => to - 10 },
      1
    );

    expect(sorted.map((alert) => alert.id)).toEqual(["near"]);
  });

  it("hits the closest alert locator within its tap radius", () => {
    const locator = persistentAlertLocatorAt(
      {
        persistentAlertLocators: [
          { id: "a", kind: "town_unfed", x: 1, y: 1, screenX: 40, screenY: 40, radius: 20 },
          { id: "b", kind: "town_unfed", x: 2, y: 2, screenX: 70, screenY: 40, radius: 20 }
        ]
      },
      63,
      40
    );

    expect(locator?.id).toBe("b");
  });

  it("backfills off-screen locators when the nearest alert candidates are already visible", () => {
    const state = {
      me: "me",
      camX: 10,
      camY: 10,
      persistentAlertLocators: [] as PersistentAlertLocator[],
      tiles: new Map<string, Tile>([
        ["10,10", unfedTownTile({ x: 10, y: 10 })],
        ["11,10", unfedTownTile({ x: 11, y: 10 })],
        ["10,11", unfedTownTile({ x: 10, y: 11 })],
        ["40,10", unfedTownTile({ x: 40, y: 10 })]
      ])
    };
    const ctx = {
      save: () => undefined,
      restore: () => undefined,
      translate: () => undefined,
      beginPath: () => undefined,
      arc: () => undefined,
      fill: () => undefined,
      stroke: () => undefined,
      rotate: () => undefined,
      moveTo: () => undefined,
      lineTo: () => undefined,
      closePath: () => undefined,
      fillText: () => undefined
    } as unknown as CanvasRenderingContext2D;

    drawPersistentAlertLocators(state, {
      ctx,
      canvas: { width: 100, height: 100 } as HTMLCanvasElement,
      worldToScreen: (wx, wy) => (wx === 40 ? { sx: 180, sy: 50 } : { sx: 50 + (wx - 10) * 10, sy: 50 + (wy - 10) * 10 }),
      toroidDelta: (from, to) => to - from,
      size: 1,
      halfW: 0,
      halfH: 0,
      nowMs: 0
    });

    expect(state.persistentAlertLocators.map((locator) => locator.id)).toEqual(["town_unfed:40,10"]);
  });
});
