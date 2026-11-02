import { afterEach, describe, expect, it } from "vitest";
import { CAPTURE_HOLD_MS } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import {
  captureAftermathForTile,
  captureAftermathMenuLines,
  isFortWreckedByCapture,
  noteRazedStructuresOnCapture,
  resetCaptureAftermathIndex,
  warScarMenuLine
} from "./client-capture-aftermath.js";

const NOW = 1_000_000;
const KEY = "4,4";
const base = { x: 4, y: 4, terrain: "LAND" } as Tile;
const beaconTile = { ...base, ownerId: "p1", ownershipState: "SETTLED", economicStructure: { ownerId: "p1", type: "RELAY_BEACON", status: "active" } } as Tile;
const captured = (extra: Record<string, unknown> = {}): Tile => ({ ...base, ownerId: "p2", ownershipState: "FRONTIER", captureHoldUntil: NOW + CAPTURE_HOLD_MS, ...extra }) as Tile;

afterEach(() => resetCaptureAftermathIndex());

describe("capture aftermath", () => {
  it("leaves a razed Relay Beacon's rubble on the ground until the hold ends", () => {
    const after = captured();
    noteRazedStructuresOnCapture(beaconTile, after, KEY, NOW);
    expect(captureAftermathForTile(after, KEY, NOW)).toEqual({ rubble: ["RELAY_BEACON"], smoke: false, burningDock: false, until: NOW + CAPTURE_HOLD_MS });
    expect(captureAftermathMenuLines(after, KEY, NOW)).toEqual(["Relay Beacon destroyed in the capture."]);
    expect(captureAftermathForTile(after, KEY, NOW + CAPTURE_HOLD_MS)).toBeUndefined();
  });

  it("leaves Siege Battery rubble too", () => {
    const battery = { ...base, ownerId: "p1", ownershipState: "SETTLED", siegeBattery: { ownerId: "p1", status: "active" } } as Tile;
    const after = captured();
    noteRazedStructuresOnCapture(battery, after, KEY, NOW);
    expect(captureAftermathForTile(after, KEY, NOW)?.rubble).toEqual(["SIEGE_BATTERY"]);
  });

  it("invents no wreck for a change of hands it didn't see happen (fogged, or no live capture hold)", () => {
    noteRazedStructuresOnCapture({ ...beaconTile, fogged: true } as Tile, captured(), KEY, NOW);
    expect(captureAftermathForTile(captured(), KEY, NOW)).toBeUndefined();
    const longAgo = { ...base, ownerId: "p2", ownershipState: "SETTLED" } as Tile;
    noteRazedStructuresOnCapture(beaconTile, longAgo, "6,6", NOW);
    expect(captureAftermathForTile(longAgo, "6,6", NOW)).toBeUndefined();
  });

  it("ignores a structure removed without the tile changing hands, or still under construction", () => {
    const { economicStructure: _razed, ...sameOwner } = beaconTile;
    noteRazedStructuresOnCapture(beaconTile, sameOwner, KEY, NOW);
    const building = { ...beaconTile, economicStructure: { ...beaconTile.economicStructure!, status: "under_construction" } } as Tile;
    noteRazedStructuresOnCapture(building, captured(), "5,5", NOW);
    expect(captureAftermathForTile(sameOwner, KEY, NOW)).toBeUndefined();
    expect(captureAftermathForTile(captured(), "5,5", NOW)).toBeUndefined();
  });

  it("marks a captured fort as wrecked while the tile is held", () => {
    const fortTile = captured({ fort: { ownerId: "p2", status: "active", variant: "FORT" } });
    expect(isFortWreckedByCapture(fortTile, NOW)).toBe(true);
    expect(captureAftermathForTile(fortTile, KEY, NOW)?.rubble).toEqual(["FORT"]);
    expect(captureAftermathMenuLines(fortTile, KEY, NOW)[0]).toMatch(/Fort wrecked in the capture/);
    expect(isFortWreckedByCapture(fortTile, NOW + CAPTURE_HOLD_MS)).toBe(false);
  });

  it("smokes over a captured resource until the hold ends", () => {
    const resourceTile = captured({ resource: "IRON" });
    expect(captureAftermathForTile(resourceTile, KEY, NOW)).toEqual({ rubble: [], smoke: true, burningDock: false, until: NOW + CAPTURE_HOLD_MS });
    expect(captureAftermathMenuLines(resourceTile, KEY, NOW)[0]).toMatch(/resource slots only count once/);
    expect(captureAftermathForTile(resourceTile, KEY, NOW + CAPTURE_HOLD_MS)).toBeUndefined();
    expect(captureAftermathForTile({ ...base, ownerId: "p2", ownershipState: "FRONTIER", resource: "IRON" } as Tile, KEY, NOW)).toBeUndefined();
  });
});

describe("burning dock", () => {
  it("sets a captured dock ablaze until the hold ends, and explains why it pays no gold", () => {
    const dock = captured({ dockId: "dock-1" });
    expect(captureAftermathForTile(dock, KEY, NOW)).toEqual({ rubble: [], smoke: false, burningDock: true, until: NOW + CAPTURE_HOLD_MS });
    expect(captureAftermathMenuLines(dock, KEY, NOW)).toEqual(["Dock set ablaze in the capture. It pays no gold until the capturing troops finish holding it and it is garrisoned."]);
    expect(captureAftermathForTile(dock, KEY, NOW + CAPTURE_HOLD_MS)).toBeUndefined();
  });
});

describe("battle scar menu line", () => {
  it("states the depth and the hours left, and is gone once the scars fade", () => {
    const scarred = { ...base, warScarLevel: 3, warScarUntil: NOW + 5 * 3_600_000 } as Tile;
    expect(warScarMenuLine(scarred, NOW)).toBe("Battle-scarred ground (3/5). Each battle here deepens the scars; they fade in 5h without more fighting.");
    expect(captureAftermathMenuLines(scarred, KEY, NOW)).toHaveLength(1);
    expect(warScarMenuLine(scarred, NOW + 5 * 3_600_000)).toBeUndefined();
  });
});
