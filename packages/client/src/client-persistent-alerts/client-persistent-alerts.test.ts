import { describe, expect, it } from "vitest";

import {
  drawPersistentAlertLocators,
  nearestPersistentAlerts,
  notificationCategoryForServerError,
  type PersistentAlert,
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
    hasMintworks: false,
    mintworksActive: false,
    hasGranary: false,
    granaryActive: false,
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
      waypoint: [] as import("../client-state/client-state.js").ClientWaypoint[],
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
      waypoint: [] as import("../client-state/client-state.js").ClientWaypoint[],
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

  it("creates a persistent alert for a waypoint paused on manpower, anchored at the blocked step's origin", () => {
    const state = {
      me: "me",
      waypoint: [
        {
          target: { x: 9, y: 9 },
          pausedForManpower: true,
          plan: {
            target: { x: 9, y: 9 },
            steps: [{ origin: { x: 7, y: 7 }, target: { x: 8, y: 7 }, action: "EXPAND" as const, durationMs: 0, goldCost: 0, manpowerCost: 10, manpowerMin: 10, throughFog: false, viaDock: false }],
            totalGold: 0,
            totalManpower: 0,
            totalDurationMs: 0,
            expandCount: 1,
            attackCount: 0,
            reachable: true
          }
        }
      ] as import("../client-state/client-state.js").ClientWaypoint[],
      tiles: new Map<string, Tile>()
    };

    expect(persistentAlertsForState(state)).toEqual([
      expect.objectContaining({
        id: "waypoint_manpower_paused:9,9",
        kind: "waypoint_manpower_paused",
        title: "Waypoint paused",
        x: 7,
        y: 7
      })
    ]);
  });

  it("ignores a muster flag owned by another player even on our own tile", () => {
    const state = {
      me: "me",
      waypoint: [] as import("../client-state/client-state.js").ClientWaypoint[],
      tiles: new Map<string, Tile>([["30,40", musterTile({ muster: { ownerId: "enemy" } })]])
    };

    expect(persistentAlertsForState(state)).toEqual([]);
  });

  it("shows both HOLD and ADVANCE muster flags", () => {
    const state = {
      me: "me",
      waypoint: [] as import("../client-state/client-state.js").ClientWaypoint[],
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
      waypoint: [] as import("../client-state/client-state.js").ClientWaypoint[],
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

  it("uses precomputedAlerts when provided instead of scanning state.tiles", () => {
    const precomputedAlerts: PersistentAlert[] = [
      {
        id: "muster_active:5,5",
        kind: "muster_active",
        title: "Muster flag active",
        detail: "Holding 100 manpower at (5, 5).",
        x: 5,
        y: 5,
        severity: "warn"
      }
    ];
    const state = {
      me: "me",
      waypoint: [] as import("../client-state/client-state.js").ClientWaypoint[],
      camX: 10,
      camY: 10,
      persistentAlertLocators: [] as PersistentAlertLocator[],
      tiles: new Map<string, Tile>([
        ["10,10", unfedTownTile({ x: 10, y: 10 })]
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
      fillText: () => undefined,
      scale: () => undefined,
      globalAlpha: 1
    } as unknown as CanvasRenderingContext2D;

    drawPersistentAlertLocators(state, {
      ctx,
      canvas: { width: 100, height: 100 } as HTMLCanvasElement,
      worldToScreen: (wx, wy) => (wx === 5 ? { sx: 180, sy: 50 } : { sx: 50 + (wx - 10) * 10, sy: 50 + (wy - 10) * 10 }),
      toroidDelta: (from, to) => to - from,
      size: 1,
      halfW: 0,
      halfH: 0,
      nowMs: 0,
      precomputedAlerts
    });

    expect(state.persistentAlertLocators.map((locator) => locator.id)).toEqual(["muster_active:5,5"]);
  });

  it("creates a shard rain locator for every landed site while the event is active", () => {
    const state = {
      me: "me",
      waypoint: [] as import("../client-state/client-state.js").ClientWaypoint[],
      tiles: new Map<string, Tile>(),
      shardRainStatus: {
        key: "rain-1",
        phase: "started" as const,
        startsAt: 0,
        expiresAt: 1_800_000,
        siteCount: 2,
        sites: [
          { x: 5, y: 5 },
          { x: 60, y: 60 }
        ]
      }
    };

    const alerts = persistentAlertsForState(state, 900_000);
    expect(alerts.map((alert) => alert.id).sort()).toEqual(["shard_rain:5,5", "shard_rain:60,60"]);
  });

  it("stops surfacing shard rain sites once the event has expired", () => {
    const state = {
      me: "me",
      waypoint: [] as import("../client-state/client-state.js").ClientWaypoint[],
      tiles: new Map<string, Tile>(),
      shardRainStatus: {
        key: "rain-1",
        phase: "started" as const,
        startsAt: 0,
        expiresAt: 1_800_000,
        siteCount: 1,
        sites: [{ x: 5, y: 5 }]
      }
    };

    expect(persistentAlertsForState(state, 1_800_001)).toEqual([]);
  });

  it("draws nothing on the 2D HUD for an on-screen shard rain site", () => {
    // On-screen sites get the real 3D bobbing badge (createResourceBadgeOverlay
    // in client-map-3d.ts, wired from client-map-3d.ts's own shardRainStatus
    // loop) instead of a 2D canvas drawing here — same as how an on-screen
    // muster flag or unfed town gets no HUD locator either, just their own
    // in-world model/badge.
    const state = {
      me: "me",
      waypoint: [] as import("../client-state/client-state.js").ClientWaypoint[],
      camX: 10,
      camY: 10,
      persistentAlertLocators: [] as PersistentAlertLocator[],
      tiles: new Map<string, Tile>(),
      shardRainStatus: {
        key: "rain-1",
        phase: "started" as const,
        startsAt: 0,
        expiresAt: Date.now() + 1_800_000,
        siteCount: 1,
        sites: [{ x: 10, y: 10 }]
      }
    };
    let drawCalls = 0;
    const countingNoop = (): void => { drawCalls += 1; };
    const ctx = {
      save: () => undefined,
      restore: () => undefined,
      translate: countingNoop,
      beginPath: countingNoop,
      arc: countingNoop,
      fill: countingNoop,
      stroke: countingNoop,
      rotate: countingNoop,
      moveTo: countingNoop,
      lineTo: countingNoop,
      quadraticCurveTo: countingNoop,
      closePath: countingNoop
    } as unknown as CanvasRenderingContext2D;

    drawPersistentAlertLocators(state, {
      ctx,
      canvas: { width: 100, height: 100 } as HTMLCanvasElement,
      worldToScreen: () => ({ sx: 50, sy: 50 }),
      toroidDelta: (from, to) => to - from,
      size: 1,
      halfW: 0,
      halfH: 0,
      nowMs: 0
    });

    expect(state.persistentAlertLocators).toEqual([]);
    expect(drawCalls).toBe(0);
  });

  it("draws the off-screen locator body as a round pin with an integrated tapered tip", () => {
    const state = {
      me: "me",
      waypoint: [] as import("../client-state/client-state.js").ClientWaypoint[],
      camX: 10,
      camY: 10,
      persistentAlertLocators: [] as PersistentAlertLocator[],
      tiles: new Map<string, Tile>([["30,40", musterTile()]])
    };
    let arcCalls = 0;
    const lineToPoints: Array<[number, number]> = [];
    const ctx = {
      save: () => undefined,
      restore: () => undefined,
      translate: () => undefined,
      beginPath: () => undefined,
      arc: () => { arcCalls += 1; },
      fill: () => undefined,
      stroke: () => undefined,
      rotate: () => undefined,
      scale: () => undefined,
      moveTo: () => undefined,
      lineTo: (x: number, y: number) => lineToPoints.push([x, y]),
      closePath: () => undefined
    } as unknown as CanvasRenderingContext2D;

    drawPersistentAlertLocators(state, {
      ctx,
      canvas: { width: 100, height: 100 } as HTMLCanvasElement,
      worldToScreen: (wx) => (wx === 30 ? { sx: 180, sy: 50 } : { sx: 50, sy: 50 }),
      toroidDelta: (from, to) => to - from,
      size: 1,
      halfW: 0,
      halfH: 0,
      nowMs: 0
    });

    // A round pin body with one integrated tapered tip: two tangent lines
    // (drawn with lineTo) into the tip, then a single arc sweeping the rest
    // of the circle back around — not the old 4-point kite/chevron outline
    // (which used only lineTo, no arc at all).
    expect(arcCalls).toBe(1);
    expect(lineToPoints.length).toBeGreaterThanOrEqual(2);
  });
});
