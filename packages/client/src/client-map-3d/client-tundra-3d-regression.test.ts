import { Scene } from "three";
import { describe, expect, it } from "vitest";
import {
  HEIGHTFIELD_HILLS_ELEVATION_BONUS,
  createHeightfield,
  heightfieldTileBaseElevation,
  heightfieldTileColor,
  type HeightfieldTerrainKind
} from "../client-map-3d-heightfield/client-map-3d-heightfield.js";
import { createHillTerrain } from "../client-map-3d-hills.js";

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

  it("actually builds dome geometry for a TUNDRA hill tile, not just the elevation math", () => {
    // client-map-3d-hills.ts has two separate GRASS/SAND-only gates: one for
    // corner-averaging exclusion (which the elevation test above covers) and
    // a second, independent one gating which tiles get a dome built at all.
    // Missing the second one leaves a genuine hole — the elevation numbers
    // for a *non-existent* dome would still look right if computed by hand,
    // so this has to check the actual built mesh, not derived elevations.
    const scene = new Scene();
    const heightfield = createHeightfield();
    const hillTerrain = createHillTerrain(scene, 64, heightfield.material);
    const allTundra = (): HeightfieldTerrainKind => "TUNDRA";
    const onlyOriginIsHill = (wx: number, wy: number): boolean => wx === 0 && wy === 0;

    const shared = {
      camX: 0, camY: 0, halfW: 3, halfH: 3,
      worldWidth: 450, worldHeight: 450,
      tileKindAt: allTundra,
      isHillsAt: onlyOriginIsHill
    };
    heightfield.rebuild(shared);
    hillTerrain.rebuild(shared);

    expect(hillTerrain.mesh.geometry.drawRange.count).toBeGreaterThan(0);

    heightfield.dispose();
    hillTerrain.dispose();
  });

  it("carries a tundraZone attribute on the dome mesh so its shared-shader color reads as TUNDRA, not SAND", () => {
    // The dome shares the main heightfield's MeshStandardMaterial (and thus
    // its onBeforeCompile shader, which requires a tundraZone attribute) but
    // has its own separate BufferGeometry. Without tundraZone on that
    // geometry too, the shader falls back to inferring grass-vs-sand from
    // vertex color alone — and TUNDRA's pale blend lands on the SAND side of
    // that inference, so a TUNDRA dome silently rendered tan/cream instead
    // of its own frost palette.
    const scene = new Scene();
    const heightfield = createHeightfield();
    const hillTerrain = createHillTerrain(scene, 64, heightfield.material);
    const allTundra = (): HeightfieldTerrainKind => "TUNDRA";
    const onlyOriginIsHill = (wx: number, wy: number): boolean => wx === 0 && wy === 0;

    const shared = {
      camX: 0, camY: 0, halfW: 3, halfH: 3,
      worldWidth: 450, worldHeight: 450,
      tileKindAt: allTundra,
      isHillsAt: onlyOriginIsHill
    };
    heightfield.rebuild(shared);
    hillTerrain.rebuild(shared);

    const domeTundraZoneAttr = hillTerrain.mesh.geometry.getAttribute("tundraZone");
    expect(domeTundraZoneAttr).toBeDefined();
    // Every tile in this synthetic world is TUNDRA, so the dome's own
    // bilinear-blended corner value should be fully 1, not left at the
    // buffer's zero-initialized default.
    expect(domeTundraZoneAttr.getX(0)).toBe(1);

    heightfield.dispose();
    hillTerrain.dispose();
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
