import { describe, expect, it } from "vitest";
import { CAPTURE_HOLD_MS, RAZED_WRECK_DURATION_MS } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import {
  captureAftermathForTile,
  captureAftermathMenuLines,
  isFortWreckedByCapture,
  warScarMenuLine
} from "./client-capture-aftermath.js";

const NOW = 1_000_000;
const base = { x: 4, y: 4, terrain: "LAND" } as Tile;
const captured = (extra: Record<string, unknown> = {}): Tile => ({ ...base, ownerId: "p2", ownershipState: "FRONTIER", captureHoldUntil: NOW + CAPTURE_HOLD_MS, ...extra }) as Tile;

describe("capture aftermath", () => {
  it("draws a razed Relay Beacon's wreck for its 24h, long after the hold ends", () => {
    const after = captured({ razedWreck: "RELAY_BEACON", razedWreckUntil: NOW + RAZED_WRECK_DURATION_MS });
    expect(captureAftermathForTile(after, NOW)).toEqual({ rubble: ["RELAY_BEACON"], smoke: false, burningDock: false, until: NOW + RAZED_WRECK_DURATION_MS });
    expect(captureAftermathMenuLines(after, NOW)).toEqual(["Relay Beacon destroyed here."]);
    const hoursLater = NOW + 20 * 3_600_000;
    const garrisoned = { ...after, ownershipState: "SETTLED", ownerId: "p3" } as Tile;
    expect(captureAftermathForTile(garrisoned, hoursLater)?.rubble).toEqual(["RELAY_BEACON"]);
    expect(captureAftermathForTile(after, NOW + RAZED_WRECK_DURATION_MS)).toBeUndefined();
  });

  it("draws a siege engine's wreck by variant", () => {
    const after = captured({ razedWreck: "DREAD_TOWER", razedWreckUntil: NOW + RAZED_WRECK_DURATION_MS });
    expect(captureAftermathForTile(after, NOW)?.rubble).toEqual(["DREAD_TOWER"]);
  });

  it("stops drawing the wreck once something is built on the tile", () => {
    const rebuilt = captured({ razedWreck: "RELAY_BEACON", razedWreckUntil: NOW + RAZED_WRECK_DURATION_MS, economicStructure: { ownerId: "p2", type: "RELAY_BEACON", status: "under_construction" } });
    expect(captureAftermathForTile(rebuilt, NOW)).toBeUndefined();
  });

  it("marks a captured fort as wrecked while the tile is held", () => {
    const fortTile = captured({ fort: { ownerId: "p2", status: "active", variant: "FORT" } });
    expect(isFortWreckedByCapture(fortTile, NOW)).toBe(true);
    expect(captureAftermathForTile(fortTile, NOW)?.rubble).toEqual(["FORT"]);
    expect(captureAftermathMenuLines(fortTile, NOW)[0]).toMatch(/Fort wrecked in the capture/);
    expect(isFortWreckedByCapture(fortTile, NOW + CAPTURE_HOLD_MS)).toBe(false);
  });

  it("smokes over a captured resource until the hold ends", () => {
    const resourceTile = captured({ resource: "IRON" });
    expect(captureAftermathForTile(resourceTile, NOW)).toEqual({ rubble: [], smoke: true, burningDock: false, until: NOW + CAPTURE_HOLD_MS });
    expect(captureAftermathMenuLines(resourceTile, NOW)[0]).toMatch(/resource slots only count once/);
    expect(captureAftermathForTile(resourceTile, NOW + CAPTURE_HOLD_MS)).toBeUndefined();
    expect(captureAftermathForTile({ ...base, ownerId: "p2", ownershipState: "FRONTIER", resource: "IRON" } as Tile, NOW)).toBeUndefined();
  });
});

describe("burning dock", () => {
  it("sets a captured dock ablaze until the hold ends, and explains why it pays no gold", () => {
    const dock = captured({ dockId: "dock-1" });
    expect(captureAftermathForTile(dock, NOW)).toEqual({ rubble: [], smoke: false, burningDock: true, until: NOW + CAPTURE_HOLD_MS });
    expect(captureAftermathMenuLines(dock, NOW)).toEqual(["Dock set ablaze in the capture. It pays no gold until the capturing troops finish holding it and it is garrisoned."]);
    expect(captureAftermathForTile(dock, NOW + CAPTURE_HOLD_MS)).toBeUndefined();
  });
});

describe("battle scar menu line", () => {
  it("states the depth and the hours left, and is gone once the scars fade", () => {
    const scarred = { ...base, warScarLevel: 3, warScarUntil: NOW + 5 * 3_600_000 } as Tile;
    expect(warScarMenuLine(scarred, NOW)).toBe("Battle-scarred ground (3/5). Each battle here deepens the scars; they fade in 5h without more fighting.");
    expect(captureAftermathMenuLines(scarred, NOW)).toHaveLength(1);
    expect(warScarMenuLine(scarred, NOW + 5 * 3_600_000)).toBeUndefined();
  });
});
