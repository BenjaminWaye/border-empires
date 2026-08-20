import { describe, expect, it } from "vitest";
import {
  HEIGHTFIELD_HILLS_ELEVATION_BONUS,
  createHeightfield,
  heightfieldTileBaseElevation,
  heightfieldTileColor,
  type HeightfieldTerrainKind
} from "../client-map-3d-heightfield/client-map-3d-heightfield.js";

describe("3d TUNDRA rendering regression guard", () => {
  it("heightfieldTileBaseElevation and heightfieldTileColor don't crash for TUNDRA and differ from GRASS/SAND", () => {
    expect(() => heightfieldTileBaseElevation("TUNDRA")).not.toThrow();
    expect(() => heightfieldTileColor("TUNDRA", 0)).not.toThrow();

    const tundraElevation = heightfieldTileBaseElevation("TUNDRA");
    expect(tundraElevation).not.toBe(heightfieldTileBaseElevation("GRASS"));
    expect(tundraElevation).not.toBe(heightfieldTileBaseElevation("SAND"));

    const tundraColor = heightfieldTileColor("TUNDRA", 0);
    expect(tundraColor).not.toEqual(heightfieldTileColor("GRASS", 0));
    expect(tundraColor).not.toEqual(heightfieldTileColor("SAND", 0));
  });

  it("renders a hills dome on a TUNDRA tile the same way it does on GRASS/SAND", () => {
    const heightfield = createHeightfield();
    const allTundra = (): HeightfieldTerrainKind => "TUNDRA";
    const onlyOriginIsHill = (wx: number, wy: number): boolean => wx === 0 && wy === 0;

    heightfield.rebuild({
      camX: 0,
      camY: 0,
      halfW: 3,
      halfH: 3,
      worldWidth: 450,
      worldHeight: 450,
      tileKindAt: allTundra,
      isHillsAt: onlyOriginIsHill
    });

    const elevCenter = heightfield.elevationAt(0, 0);
    const cornerMax = Math.max(
      heightfield.cornerYAt(0, 0),
      heightfield.cornerYAt(1, 0),
      heightfield.cornerYAt(0, 1),
      heightfield.cornerYAt(1, 1)
    );

    // Same assertion shape as the GRASS/SAND hills regression test: a TUNDRA
    // hill tile should carry exactly one bonus-height above its flat TUNDRA
    // neighbours, not render flat (which is what happened before TUNDRA was
    // added to the hills-eligibility gates in client-map-3d-heightfield.ts
    // and client-map-3d-hills.ts).
    const bonusAboveCorners = elevCenter - cornerMax;
    expect(bonusAboveCorners).toBeGreaterThan(HEIGHTFIELD_HILLS_ELEVATION_BONUS - 0.1);
    expect(bonusAboveCorners).toBeLessThan(HEIGHTFIELD_HILLS_ELEVATION_BONUS + 0.1);

    heightfield.dispose();
  });

  it("marks tundraZone 1 at a corner fully surrounded by TUNDRA tiles and 0 surrounded by GRASS", () => {
    const heightfield = createHeightfield();
    const allTundra = (): HeightfieldTerrainKind => "TUNDRA";
    const allGrass = (): HeightfieldTerrainKind => "GRASS";

    heightfield.rebuild({
      camX: 0,
      camY: 0,
      halfW: 2,
      halfH: 2,
      worldWidth: 450,
      worldHeight: 450,
      tileKindAt: allTundra
    });
    // tileKindAt ignores its (wx, wy) args and returns TUNDRA everywhere, so
    // every written vertex (VERT_DIM = 241, see client-map-3d-heightfield.ts)
    // should end up fully TUNDRA — pick an arbitrary in-range vertex index.
    const VERT_DIM = 241;
    const sampleVertIdx = 1 * VERT_DIM + 1;
    const tundraZoneAttr = heightfield.geometry.getAttribute("tundraZone");
    expect(tundraZoneAttr.getX(sampleVertIdx)).toBe(1);
    heightfield.dispose();

    const heightfield2 = createHeightfield();
    heightfield2.rebuild({
      camX: 0,
      camY: 0,
      halfW: 2,
      halfH: 2,
      worldWidth: 450,
      worldHeight: 450,
      tileKindAt: allGrass
    });
    const grassZoneAttr = heightfield2.geometry.getAttribute("tundraZone");
    expect(grassZoneAttr.getX(sampleVertIdx)).toBe(0);
    heightfield2.dispose();
  });
});
