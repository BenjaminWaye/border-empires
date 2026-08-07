import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  HEIGHTFIELD_HILLS_ELEVATION_BONUS,
  createHeightfield,
  type HeightfieldTerrainKind
} from "../client-map-3d-heightfield/client-map-3d-heightfield.js";

const clientSource = (filename: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, filename), "utf8");
};

let drawHillsOverlay: typeof import("../client-map-render-hills-overlay.js").drawHillsOverlay;
let setTrue3DRendererActive: typeof import("../client-renderer-mode.js").setTrue3DRendererActive;
let hillsConstants: typeof import("../client-constants.js");
let setWorldSeed: typeof import("@border-empires/shared").setWorldSeed;

type MockCanvasContext = Pick<
  CanvasRenderingContext2D,
  "save" | "restore" | "fillRect" | "beginPath" | "moveTo" | "quadraticCurveTo" | "closePath" | "fill" | "fillStyle" | "createLinearGradient"
>;

const createMockContext = (): { ctx: CanvasRenderingContext2D; fillCalls: number } => {
  let fillCalls = 0;
  const gradient = { addColorStop: () => undefined } as unknown as CanvasGradient;
  const ctx: MockCanvasContext = {
    fillStyle: "",
    save: () => undefined,
    restore: () => undefined,
    fillRect: () => undefined,
    beginPath: () => undefined,
    moveTo: () => undefined,
    quadraticCurveTo: () => undefined,
    closePath: () => undefined,
    fill: () => {
      fillCalls += 1;
    },
    createLinearGradient: () => gradient
  };
  return {
    ctx: ctx as CanvasRenderingContext2D,
    get fillCalls() {
      return fillCalls;
    }
  };
};

// Same seed used by client-forest-3d-regression.test.ts and
// vision-footprint-table.test.ts's KNOWN_HILLS_TILE — moved together with
// that constant once hills were concentrated into the BROKEN_HIGHLANDS
// region (see isHillsRegionAt in worldgen-hills.ts).
const seededHillsTile = { x: 99, y: 57 };

beforeAll(async () => {
  class MockImage {
    decoding = "";
    src = "";
    complete = true;
    naturalWidth = 1;
    naturalHeight = 1;
  }
  Object.assign(globalThis, { Image: MockImage });
  ({ setWorldSeed } = await import("@border-empires/shared"));
  setWorldSeed(1);
  ({ drawHillsOverlay } = await import("../client-map-render-hills-overlay.js"));
  ({ setTrue3DRendererActive } = await import("../client-renderer-mode.js"));
  hillsConstants = await import("../client-constants.js");
  expect(hillsConstants.isHillsTile(seededHillsTile.x, seededHillsTile.y)).toBe(true);
});

afterEach(() => {
  setTrue3DRendererActive(false);
});

describe("3d hills rendering regression guard", () => {
  it("draws the legacy hills overlay for hills tiles while true 3d is disabled", () => {
    const mock = createMockContext();

    setTrue3DRendererActive(false);
    drawHillsOverlay(mock.ctx, seededHillsTile.x, seededHillsTile.y, 0, 0, 48);

    expect(mock.fillCalls).toBeGreaterThan(0);
  });

  it("skips the legacy hills overlay entirely while the true 3d renderer is active", () => {
    const mock = createMockContext();

    setTrue3DRendererActive(true);
    drawHillsOverlay(mock.ctx, seededHillsTile.x, seededHillsTile.y, 0, 0, 48);

    expect(mock.fillCalls).toBe(0);
  });

  it("ownership overlay material keeps depth testing on, with hill drape matching the terrain's own subdivision", () => {
    // depthTest:false used to be required to keep the overlay visible on
    // top of hill domes, back when hill tiles used one flat bridging
    // plane that sank below the dome's peak. addHillTile now drapes the
    // overlay as a constant-offset parallel of the dome's own mesh (same
    // SUBDIV as the terrain, same per-vertex formula, same triangle
    // diagonal split — see HILL_SUBDIV in client-map-3d-ownership-overlay.ts),
    // so it always sits above the terrain and depth testing can stay on.
    // Leaving depth testing off made the overlay ignore the depth buffer
    // and paint over every opaque object on screen, including
    // towns/structures standing on the tile. A coarser HILL_SUBDIV (6,
    // vs. the terrain's 10) was tried first and produced visible gaps
    // near the dome peak once depth testing was re-enabled — matching
    // the subdivision exactly is what makes this safe.
    const overlaySource = clientSource("../client-map-3d-ownership-overlay.ts");
    expect(overlaySource).not.toContain("depthTest: false,");
    expect(overlaySource).toContain("const HILL_SUBDIV = 10;");
    // depthWrite: false stays — verify it doesn't regress.
    expect(overlaySource).toContain("depthWrite: false,");
  });

  it("surfaceY does not double-count HEIGHTFIELD_HILLS_ELEVATION_BONUS on hill tiles", () => {
    // heightfield.elevationAt() already bakes the hills bonus into a hill
    // tile's own cached elevation (see sampleTile in
    // client-map-3d-heightfield.ts). surfaceY used to add the bonus a
    // second time on top of that, so buildings/farms/towns floated a full
    // bonus-height above the dome's actual peak instead of resting on it.
    const mapSource = clientSource("../client-map-3d/client-map-3d.ts");
    expect(mapSource).toContain("heightfield.elevationAt(wx, wy)");
    expect(mapSource).not.toContain("isHillsTile(wx, wy) ? HEIGHTFIELD_HILLS_ELEVATION_BONUS : 0");
  });

  it("elevationAt carries exactly one hills-bonus above the flat ground corners around an isolated hill tile", () => {
    const heightfield = createHeightfield();
    const allGrass = (): HeightfieldTerrainKind => "GRASS";
    const onlyOriginIsHill = (wx: number, wy: number): boolean => wx === 0 && wy === 0;

    heightfield.rebuild({
      camX: 0,
      camY: 0,
      halfW: 3,
      halfH: 3,
      worldWidth: 450,
      worldHeight: 450,
      tileKindAt: allGrass,
      isHillsAt: onlyOriginIsHill
    });

    const elevCenter = heightfield.elevationAt(0, 0);
    const cornerMax = Math.max(
      heightfield.cornerYAt(0, 0),
      heightfield.cornerYAt(1, 0),
      heightfield.cornerYAt(0, 1),
      heightfield.cornerYAt(1, 1)
    );

    // The corners border real flat grass neighbours, so they carry no
    // hills bonus (ground level only). elevationAt at the hill tile's own
    // coordinates should sit almost exactly one bonus-height above that --
    // not two, which is what the earlier double-count regressed to.
    const bonusAboveCorners = elevCenter - cornerMax;
    expect(bonusAboveCorners).toBeGreaterThan(HEIGHTFIELD_HILLS_ELEVATION_BONUS - 0.1);
    expect(bonusAboveCorners).toBeLessThan(HEIGHTFIELD_HILLS_ELEVATION_BONUS + 0.1);

    heightfield.dispose();
  });
});
