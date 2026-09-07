import { describe, expect, it } from "vitest";
import { createFleetOverlay, disposeFleetOverlay, animateFleetOverlay, type FleetOverlayOrder } from "./client-space-fleet-overlay.js";
import { fleetOriginPosition, galaxyLayoutPosition } from "../client-space-view-state.js";

const order = (overrides: Partial<FleetOverlayOrder> = {}): FleetOverlayOrder => ({
  id: "fleet-order-1",
  ownerAuthUid: "uid-1",
  targetSeasonId: "season-2",
  composition: { RAIDER: 2 },
  sentAt: 0,
  arrivesAt: 1000,
  ...overrides
});

describe("createFleetOverlay", () => {
  it("builds one hull model per distinct hull class present in the composition", () => {
    const entry = createFleetOverlay(order({ composition: { RAIDER: 3, SCOUT: 1, DREADNOUGHT: 0 } }));
    expect(entry.hulls.map((h) => h.hullId).sort()).toEqual(["RAIDER", "SCOUT"]);
  });

  it("starts at the origin position (own-territory launch point when originSeasonId is set)", () => {
    const entry = createFleetOverlay(order({ originSeasonId: "season-1" }));
    const expectedOrigin = fleetOriginPosition("season-1", "uid-1");
    expect(entry.group.position.toArray()).toEqual([expectedOrigin.x, expectedOrigin.y, expectedOrigin.z]);
  });

  it("falls back to a deterministic owner-hashed launch point when there is no originSeasonId", () => {
    const entry = createFleetOverlay(order());
    const expectedOrigin = fleetOriginPosition(undefined, "uid-1");
    expect(entry.group.position.toArray()).toEqual([expectedOrigin.x, expectedOrigin.y, expectedOrigin.z]);
  });

  it("resolves the target to the same deterministic layout position every territory renders at", () => {
    const entry = createFleetOverlay(order({ targetSeasonId: "season-9" }));
    const expectedTarget = galaxyLayoutPosition("season-9");
    expect(entry.target).toEqual(expectedTarget);
  });
});

describe("animateFleetOverlay", () => {
  it("sits at the origin at sentAt and at the target at arrivesAt", () => {
    const entry = createFleetOverlay(order({ originSeasonId: "season-1", targetSeasonId: "season-2", sentAt: 100, arrivesAt: 200 }));
    animateFleetOverlay(entry, 100);
    expect(entry.group.position.toArray()).toEqual([entry.origin.x, entry.origin.y, entry.origin.z]);
    animateFleetOverlay(entry, 200);
    expect(entry.group.position.x).toBeCloseTo(entry.target.x);
    expect(entry.group.position.y).toBeCloseTo(entry.target.y);
    expect(entry.group.position.z).toBeCloseTo(entry.target.z);
  });

  it("is halfway between origin and target at the midpoint in time", () => {
    const entry = createFleetOverlay(order({ sentAt: 0, arrivesAt: 1000 }));
    animateFleetOverlay(entry, 500);
    expect(entry.group.position.x).toBeCloseTo((entry.origin.x + entry.target.x) / 2);
  });

  it("clamps to the target position past arrivesAt rather than overshooting", () => {
    const entry = createFleetOverlay(order({ sentAt: 0, arrivesAt: 1000 }));
    animateFleetOverlay(entry, 5000);
    expect(entry.group.position.x).toBeCloseTo(entry.target.x);
  });
});

describe("disposeFleetOverlay", () => {
  it("does not throw for a multi-hull composition", () => {
    expect(() => disposeFleetOverlay(createFleetOverlay(order({ composition: { RAIDER: 1, DREADNOUGHT: 1, TANKER: 1 } })))).not.toThrow();
  });
});
