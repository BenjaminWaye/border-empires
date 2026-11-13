// @vitest-environment happy-dom
// Supply line, moving goods, refined-deposit overlay and picker highlight in
// both renderer adapters (territory-development-plan.md Phase 2, Client).
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstancedMesh, Matrix4, Scene, Vector3 } from "three";
import type { ClientState } from "../client-state/client-state.js";
import { createDistrictCanvas } from "../client-town-district/district-canvas.js";
import { createDistrictMap3D } from "../client-town-district/district-map-3d.js";
import { addRawResourceInstance, type RawResourceOverlays } from "../client-map-3d-raw-resource-dispatch/client-map-3d-raw-resource-dispatch.js";
import { builtResourceOverlayForTile, refinedDepositOverlayForTile } from "../client-map-render/client-map-render-resource-overlays.js";
import { REFINERY_FIXTURE_ME, placeRefineryFixture, refineryFixtureGrid } from "./refinery-fixtures.js";
import { refineryGoodsPositions } from "./refinery-goods.js";
import { refinedDepositAt, refinerySceneAround, resetRefineryScene } from "./refinery-scene.js";
import { buildRefineryHighlight, setRefineryPickerHighlight } from "./refinery-picker-highlight.js";
import { createRefineryHighlight3D } from "./refinery-highlight-3d.js";

const FIELD = { x: 106, y: 99 };
const scenario = (linked = true) => {
  const tiles = refineryFixtureGrid();
  const refinery = placeRefineryFixture(tiles, 101, 100, "TITANIUM_REFINERY", { field: FIELD });
  if (!linked) for (let y = 95; y <= 105; y += 1) Object.assign(tiles.get(`104,${y}`)!, { ownerId: "p2", ownershipState: "SETTLED" });
  const state = { tiles, tilesRevision: linked ? 1 : 2, me: REFINERY_FIXTURE_ME, selected: undefined, camX: 100, camY: 100, dormantStructures: [] as ClientState["dormantStructures"] };
  return { tiles, refinery, state };
};

afterEach(() => { resetRefineryScene(); setRefineryPickerHighlight(undefined); });

describe("refinery scene", () => {
  it("runs a supply line from the refinery's port over your land to the nearest field tile, and marks the field refined", () => {
    const { state } = scenario();
    const scene = refinerySceneAround(state, { x: 100, y: 100 }, 8, 8);
    expect(scene.paths).toHaveLength(1);
    const points = scene.paths[0]!.points;
    expect(points[0]!.x).toBeGreaterThan(101.5); // leaves from the model's port, not its centre
    expect(["106.5,99.5", "106.5,100.5"]).toContain(`${points.at(-1)!.x},${points.at(-1)!.y}`);
    expect(scene.edges.every((edge) => edge.townKey === "100,100" && edge.active && !edge.buried)).toBe(true);
    expect([...scene.refined.keys()].sort()).toEqual(["106,100", "106,99", "107,99"]);
    expect(refinedDepositAt(107, 99)).toBe("TITANIUM");
  });

  it("drops the line, the goods and the refined tiles when the link breaks", () => {
    const { state } = scenario(false);
    const scene = refinerySceneAround(state, { x: 100, y: 100 }, 8, 8);
    expect(scene.paths).toEqual([]);
    expect(scene.edges).toEqual([]);
    expect(scene.refined.size).toBe(0);
    expect(refinedDepositAt(106, 99)).toBeUndefined();
  });

  it("moves goods from the field towards the refinery, and none on a line that is not working", () => {
    const path = { points: [{ x: 101.8, y: 100.5 }, { x: 106.5, y: 100.5 }], working: true };
    const early = refineryGoodsPositions(path, 0), later = refineryGoodsPositions(path, 1000);
    expect(early.length).toBeGreaterThanOrEqual(2);
    expect(later[0]!.x).toBeLessThan(early[0]!.x);
    expect(refineryGoodsPositions({ ...path, working: false }, 0)).toEqual([]);
  });
});

const recordingContext = (): { ctx: CanvasRenderingContext2D; calls: Array<{ name: string; style: unknown }> } => {
  const calls: Array<{ name: string; style: unknown }> = [];
  const target: Record<string, unknown> = { fillStyle: "", strokeStyle: "" };
  const ctx = new Proxy(target, {
    get: (object, name: string) => name in object ? object[name] : (..._args: unknown[]) => { calls.push({ name, style: object.fillStyle }); },
    set: (object, name: string, value) => { object[name] = value; return true; }
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
};

describe("2D adapter", () => {
  const draw = (linked: boolean, highlight = false) => {
    const { state } = scenario(linked);
    const { ctx, calls } = recordingContext();
    if (highlight) setRefineryPickerHighlight(buildRefineryHighlight([{ keys: ["106,99"], tone: "eligible" }, { keys: ["110,100"], tone: "unlinked" }]));
    const canvas = createDistrictCanvas({ state, ctx, visibilityAt: () => "visible", terrainAt: () => "LAND", worldToScreen: (x, y, size) => ({ sx: 400 + (x - 100) * size, sy: 300 + (y - 100) * size }) });
    canvas.plots(false);
    canvas.draw(48, 8, 8);
    return calls;
  };

  it("draws the supply line with the district's service lines and crates on it", () => {
    const calls = draw(true);
    expect(calls.filter((call) => call.name === "lineTo").length).toBeGreaterThan(0);
    expect(calls.filter((call) => call.name === "fillRect" && call.style === "#c8d0d8").length).toBeGreaterThanOrEqual(2);
  });

  it("draws neither supply line nor crates for a broken link (the refinery keeps its own line to the town)", () => {
    const linked = draw(true).filter((call) => call.name === "lineTo").length;
    resetRefineryScene();
    const calls = draw(false);
    expect(calls.filter((call) => call.name === "lineTo").length).toBeGreaterThan(0);
    expect(calls.filter((call) => call.name === "lineTo").length).toBeLessThan(linked);
    expect(calls.filter((call) => call.name === "fillRect")).toHaveLength(0);
  });

  it("draws the picker's highlight while a picker is open", () => {
    const calls = draw(false, true);
    expect(calls.filter((call) => call.name === "strokeRect")).toHaveLength(2);
  });

  it("swaps a processed deposit's art for the former Mine art, and only while it is processed", () => {
    const { state, tiles } = scenario();
    refinerySceneAround(state, { x: 100, y: 100 }, 8, 8);
    const image = refinedDepositOverlayForTile(tiles.get("106,99")!);
    expect(image?.src ?? "").toMatch(/titanium-mine-overlay-\d\.svg/);
    expect(builtResourceOverlayForTile(tiles.get("106,99")!)).toBe(image);
    expect(refinedDepositOverlayForTile(tiles.get("110,100")!)).toBeUndefined();
    const broken = scenario(false);
    refinerySceneAround(broken.state, { x: 100, y: 100 }, 8, 8);
    expect(refinedDepositOverlayForTile(broken.tiles.get("106,99")!)).toBeUndefined();
  });
});

describe("true-3D adapter", () => {
  const build = (linked: boolean) => {
    const { state, tiles, refinery } = scenario(linked);
    const scene = new Scene();
    const map = createDistrictMap3D(scene, 32, { state, origin: { camX: 100, camY: 100 }, visibilityAt: () => "visible", cornerYAt: () => 0, isHillsAt: () => false, hillCutAt: () => undefined, rise: 0.01 });
    map.clear({ camX: 100, camY: 100, halfW: 8, halfH: 8 });
    for (const tile of [tiles.get("100,100")!, refinery]) map.addTile(tile, { x: tile.x - 100 + 0.5, z: tile.y - 100 + 0.5, wx: tile.x, wy: tile.y, surfaceY: 0 }, 1_000);
    map.commit({ camX: 100, camY: 100 });
    map.update(1_000);
    return { map, scene };
  };

  it("adds the supply line to the district pipes and carries loads on it", () => {
    const { map, scene } = build(true);
    expect(map.diagnostics.links.edges).toBeGreaterThan(1);
    expect(map.diagnostics.goods).toMatchObject({ lines: 1 });
    const goods = scene.children.find((child): child is InstancedMesh => child instanceof InstancedMesh && child.name === "refinery-goods")!;
    expect(goods.count).toBeGreaterThanOrEqual(2);
    const matrix = new Matrix4();
    goods.getMatrixAt(0, matrix);
    const position = new Vector3().setFromMatrixPosition(matrix);
    expect(position.x).toBeGreaterThan(1.5);
    expect(position.x).toBeLessThan(7);
    map.dispose();
  });

  it("drops line and loads for a broken link", () => {
    const linked = build(true);
    const linkedEdges = linked.map.diagnostics.links.edges;
    linked.map.dispose();
    resetRefineryScene();
    const { map } = build(false);
    expect(map.diagnostics.links.edges).toBeLessThan(linkedEdges);
    expect(map.diagnostics.goods).toMatchObject({ lines: 0, loads: 0 });
    map.dispose();
  });

  it("routes a processed deposit to the refined (Mine / Umbrite Rig) model instead of the bare deposit", () => {
    const { state, tiles } = scenario();
    refinerySceneAround(state, { x: 100, y: 100 }, 8, 8);
    const overlays = {
      farmland: { addInstance: vi.fn() }, fishing: { addInstance: vi.fn() }, titaniumDeposit: { addInstance: vi.fn() },
      umbriteDeposit: { addInstance: vi.fn() }, generic: { addInstance: vi.fn() }, refined: { addInstance: vi.fn() }
    } satisfies RawResourceOverlays;
    const at = (x: number, y: number) => ({ sceneX: 0, sceneZ: 0, surfaceY: 0, flatOverlayY: 0, worldTileX: x, worldTileY: y });
    addRawResourceInstance(overlays, "TITANIUM", tiles.get("106,99"), at(106, 99), () => undefined);
    addRawResourceInstance(overlays, "TITANIUM", tiles.get("110,100"), at(110, 100), () => undefined);
    expect(overlays.refined.addInstance).toHaveBeenCalledWith(0, 0, 0, "TITANIUM", 106, 99);
    expect(overlays.titaniumDeposit.addInstance).toHaveBeenCalledTimes(1);
    expect(overlays.titaniumDeposit.addInstance).toHaveBeenCalledWith(0, 0, 0, 110, 100);
  });

  it("tints the picker's tiles on the 3D ground", () => {
    const scene = new Scene();
    const highlight = createRefineryHighlight3D(scene);
    const deps = { state: { tiles: new Map() }, sceneOrigin: { camX: 100, camY: 100 }, tileVisibilityStateAt: () => "visible" as const, cornerYAt: () => 0 };
    expect(highlight.sync(deps)).toBe(0);
    setRefineryPickerHighlight(buildRefineryHighlight([{ keys: ["102,100", "103,100"], tone: "reach" }, { keys: ["106,99"], tone: "eligible" }]));
    expect(highlight.sync(deps)).toBe(3);
    highlight.dispose();
  });
});
