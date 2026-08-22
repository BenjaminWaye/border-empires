import { describe, expect, it } from "vitest";
import { Color, Scene } from "three";

import { createOwnershipBorderOverlay, addOwnershipBorderEdgesForTile, DEFAULT_BORDER_WIDTH } from "./client-map-3d-ownership-border-overlay.js";
import type { Tile } from "./client-types.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

const makeTile = (x: number, y: number, ownerId: string | undefined, ownershipState: Tile["ownershipState"]): Tile =>
  ({ x, y, terrain: "LAND", ownerId, ownershipState } as Tile);

describe("createOwnershipBorderOverlay", () => {
  it("commits zero edges when nothing was added", () => {
    const scene = new Scene();
    const overlay = createOwnershipBorderOverlay(scene, 8);
    overlay.commit();
    expect(overlay.mesh.geometry.drawRange.count).toBe(0);
    overlay.dispose();
  });

  it("writes a quad's worth of indices per addEdge call", () => {
    const scene = new Scene();
    const overlay = createOwnershipBorderOverlay(scene, 8);
    overlay.addEdge(0, 0, 0, 1, 0, 0, 0, 1, DEFAULT_BORDER_WIDTH, new Color(1, 0, 0));
    overlay.commit();
    expect(overlay.mesh.geometry.drawRange.count).toBe(6);
    overlay.dispose();
  });
});

describe("addOwnershipBorderEdgesForTile", () => {
  it("draws all four sides for an isolated owned tile", () => {
    const scene = new Scene();
    const overlay = createOwnershipBorderOverlay(scene, 8);
    const tile = makeTile(5, 5, "me", "SETTLED");
    const tiles = new Map<string, Tile>([[keyFor(5, 5), tile]]);
    const deps = { tiles, keyFor, wrapX: (v: number) => v, wrapY: (v: number) => v };

    addOwnershipBorderEdgesForTile(overlay, tile, deps, -0.5, 0.5, -0.5, 0.5, 0, 0, 0, 0, new Color(1, 1, 1));
    overlay.commit();

    expect(overlay.mesh.geometry.drawRange.count).toBe(4 * 6);
    overlay.dispose();
  });

  it("omits the shared side between two same-owner, same-state tiles", () => {
    const scene = new Scene();
    const overlay = createOwnershipBorderOverlay(scene, 8);
    const tile = makeTile(5, 5, "me", "SETTLED");
    const neighborRight = makeTile(6, 5, "me", "SETTLED");
    const tiles = new Map<string, Tile>([
      [keyFor(5, 5), tile],
      [keyFor(6, 5), neighborRight]
    ]);
    const deps = { tiles, keyFor, wrapX: (v: number) => v, wrapY: (v: number) => v };

    addOwnershipBorderEdgesForTile(overlay, tile, deps, -0.5, 0.5, -0.5, 0.5, 0, 0, 0, 0, new Color(1, 1, 1));
    overlay.commit();

    // Right side is interior (shared with same owner+state neighbor) -- only
    // the other 3 exposed sides should draw.
    expect(overlay.mesh.geometry.drawRange.count).toBe(3 * 6);
    overlay.dispose();
  });
});
