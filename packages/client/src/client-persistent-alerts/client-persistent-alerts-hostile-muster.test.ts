import { describe, expect, it } from "vitest";

import { drawPersistentAlertLocators, type PersistentAlert, type PersistentAlertLocator, persistentAlertsForState } from "./client-persistent-alerts.js";
import type { ClientWaypoint } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";

const enemyFlag = (x: number, y: number, mode: "HOLD" | "ADVANCE"): Tile => ({
  x,
  y,
  terrain: "LAND",
  ownerId: "enemy",
  ownershipState: "SETTLED",
  muster: { ownerId: "enemy", amount: 120, mode, updatedAt: 0 }
});

describe("persistent alerts: enemy muster flags near the border", () => {
  it("creates a hostile_muster alert for an enemy flag near our border, but not for one far away", () => {
    const state = {
      me: "me",
      waypoint: [] as ClientWaypoint[],
      playerNames: new Map([["enemy", "Vorland"]]),
      tiles: new Map<string, Tile>([
        ["10,10", { x: 10, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" }],
        ["12,10", enemyFlag(12, 10, "ADVANCE")],
        ["60,60", enemyFlag(60, 60, "HOLD")]
      ])
    };

    expect(persistentAlertsForState(state)).toEqual([
      expect.objectContaining({
        id: "hostile_muster:12,10",
        kind: "hostile_muster",
        title: "Enemy muster flag",
        detail: "Vorland's muster flag is set to Advance, 2 tiles from your border.",
        severity: "error",
        x: 12,
        y: 10
      })
    ]);
  });

  it("gives enemy muster flags the locator slots ahead of nearer own alerts", () => {
    const ownAlert = (x: number): PersistentAlert => ({ id: `muster_active:${x},10`, kind: "muster_active", title: "", detail: "", x, y: 10, severity: "warn" });
    const precomputedAlerts: PersistentAlert[] = [
      ownAlert(30),
      ownAlert(31),
      ownAlert(32),
      { id: "hostile_muster:90,10", kind: "hostile_muster", title: "", detail: "", x: 90, y: 10, severity: "error" }
    ];
    const state = {
      me: "me",
      waypoint: [] as ClientWaypoint[],
      camX: 10,
      camY: 10,
      persistentAlertLocators: [] as PersistentAlertLocator[],
      tiles: new Map<string, Tile>()
    };
    const noop = () => undefined;
    const ctx = new Proxy({}, { get: () => noop, set: () => true }) as unknown as CanvasRenderingContext2D;

    drawPersistentAlertLocators(state, {
      ctx,
      canvas: { width: 100, height: 100 } as HTMLCanvasElement,
      worldToScreen: (wx, wy) => ({ sx: 50 + (wx - 10) * 10, sy: 50 + (wy - 10) * 10 }),
      toroidDelta: (from, to) => to - from,
      size: 1,
      halfW: 0,
      halfH: 0,
      nowMs: 0,
      precomputedAlerts
    });

    expect(state.persistentAlertLocators.map((locator) => locator.id)).toEqual([
      "hostile_muster:90,10",
      "muster_active:30,10",
      "muster_active:31,10"
    ]);
  });

});
