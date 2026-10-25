import { renderDistrictBenchmark } from "./town-district-benchmark.js";
import type { Meta, StoryObj } from "@storybook/html-vite";
import { Mesh, MeshStandardMaterial, PlaneGeometry, PMREMGenerator } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { createTownOverlay } from "@client/client-map-3d-town-overlay.js";
import { createDistrictMap3D } from "@client/client-town-district/district-map-3d.js";
import { createDistrictOverlay } from "@client/client-town-district/district-overlay.js";
import { DISTRICT_BUILDING_KINDS, type DistrictBuildingKind } from "@client/client-town-district/district-catalog.js";
import { createDistrictCanvas } from "@client/client-town-district/district-canvas.js";
import { districtArtUrl } from "@client/client-town-district/district-art.js";
import { districtFixture } from "@client/client-town-district/district-fixtures.js";
import type { Tile } from "@client/client-types.js";
import { createStage, wrapWithCleanup } from "../../fixtures/three-stage.js";

type Args = {
  view: "district" | "catalogue" | "2D";
  radius: 1 | 2;
  tier: "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS";
  slope: boolean;
  occupancy: "full" | "sparse";
  state: "active" | "construction" | "removing" | "inactive" | "dormant";
  yaw: number;
};

const fixtureFor = (args: Args) => {
  const fixture = districtFixture();
  if (fixture.town.town) fixture.town.town.populationTier = args.tier;
  fixture.tiles.delete(`${fixture.building.x},${fixture.building.y}`);
  let i = 0;
  for (let dy = -args.radius; dy <= args.radius; dy += 1) for (let dx = -args.radius; dx <= args.radius; dx += 1) {
    if ((!dx && !dy) || (args.occupancy === "sparse" && (dx + dy) % 2)) continue;
    const kind = DISTRICT_BUILDING_KINDS[(i * 7) % DISTRICT_BUILDING_KINDS.length] ?? "MANUFACTORY";
    const building: Tile = { x: 100 + dx, y: 100 + dy, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED" };
    const inProgress = args.state === "construction" || args.state === "removing";
    const record = { ownerId: "p1", status: args.state === "construction" ? "under_construction" as const : args.state === "removing" ? "removing" as const : args.state === "inactive" ? "inactive" as const : "active" as const,
      supportAnchor: { x: 100, y: 100 }, ...(inProgress ? { startedAt: Date.now() - 50_000, completesAt: Date.now() + 50_000, pausedAt: Date.now() } : {}) };
    if (kind === "OBSERVATORY") building.observatory = record;
    else building.economicStructure = { ...record, type: kind };
    fixture.tiles.set(`${building.x},${building.y}`, building);
    i += 1;
  }
  return { ...fixture, state: {
    tiles: fixture.tiles, tilesRevision: 1, me: "p1", selected: { x: 100, y: 100 }, camX: 100, camY: 100,
    dormantStructures: args.state === "dormant" ? [...fixture.tiles.values()].filter(t => t.economicStructure || t.observatory).map(t => ({ key: `${t.x},${t.y}:${t.observatory ? "observatory" : "economicStructure"}`, resources: [] })) : []
  } };
};

const render2D = (args: Args): HTMLElement => {
  const { tiles, state } = fixtureFor(args);
  const container = document.createElement("div");
  const canvas = document.createElement("canvas");
  canvas.width = 1000; canvas.height = 800;
  canvas.style.width = "100%"; canvas.style.maxHeight = "85vh"; canvas.style.objectFit = "contain";
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D context unavailable");
  const images = new Map<DistrictBuildingKind, HTMLImageElement>();
  const renderer = createDistrictCanvas({ state, ctx, visibilityAt: () => "visible", terrainAt: () => "LAND",
    worldToScreen: (x, y, size) => ({ sx: 500 + (x - 100) * size, sy: 400 + (y - 100) * size }) });
  const size = args.radius === 1 ? 170 : 120;
  const paint = (): void => {
    ctx.fillStyle = "#536b39"; ctx.fillRect(0, 0, 1000, 800);
    renderer.draw(size, 4, 4);
    for (const tile of tiles.values()) {
      const x = 500 + (tile.x - 100) * size - size / 2, y = 400 + (tile.y - 100) * size - size / 2;
      if (tile.town) {
        ctx.fillStyle = "#484c53"; ctx.fillRect(x + 15, y + 15, size - 30, size - 30);
        ctx.strokeStyle = "#d2af6d"; ctx.strokeRect(x + 15, y + 15, size - 30, size - 30);
        ctx.fillStyle = "#fff0b5"; ctx.font = "16px sans-serif"; ctx.textAlign = "center"; ctx.fillText(args.tier, x + size / 2, y + size / 2);
      }
      const kind = tile.observatory ? "OBSERVATORY" : tile.economicStructure?.type;
      const image = kind && images.get(kind as DistrictBuildingKind);
      if (image?.complete && image.naturalWidth) {
        ctx.globalAlpha = args.state === "dormant" ? 0.5 : 1;
        ctx.drawImage(image, x, y, size, size); ctx.globalAlpha = 1;
      }
    }
  };
  for (const kind of DISTRICT_BUILDING_KINDS) {
    const image = new Image(); image.onload = paint; image.src = districtArtUrl(kind) ?? ""; images.set(kind, image);
  }
  paint(); container.appendChild(canvas);
  return container;
};

const render = (args: Args): HTMLElement => {
  if (args.view === "2D") return render2D(args);
  const catalogue = args.view === "catalogue";
  const stage = createStage({ width: 1200, height: 850, camera: "orthographic", cameraDistance: 12,
    orthoHalfHeight: catalogue ? 4.3 : args.radius === 1 ? 1.85 : 2.8, background: "#25342b" });
  const yaw = args.yaw * Math.PI / 180;
  stage.camera.position.set(Math.sin(yaw) * 8, 8, Math.cos(yaw) * 8);
  stage.camera.lookAt(catalogue ? 0 : 0.5, 0.1, catalogue ? 0 : 0.5);
  stage.canvas.style.maxHeight = "85vh"; stage.canvas.style.objectFit = "contain";
  const pmrem = new PMREMGenerator(stage.renderer), room = new RoomEnvironment();
  const environment = pmrem.fromScene(room); room.dispose(); pmrem.dispose();
  const cleanups: Array<() => void> = [() => environment.dispose()];
  const elevation = (x: number, y: number): number => args.slope ? (x - 100) * 0.055 + Math.cos((y - 100) * 0.7) * 0.065 : 0;
  const groundGeo = new PlaneGeometry(12, 10, 48, 40).rotateX(-Math.PI / 2);
  const positions = groundGeo.getAttribute("position");
  for (let i = 0; i < positions.count; i += 1) positions.setY(i, elevation(100 + positions.getX(i), 100 + positions.getZ(i)) - 0.005);
  groundGeo.computeVertexNormals();
  const groundMat = new MeshStandardMaterial({ color: "#687e42", roughness: 0.95 });
  stage.scene.add(new Mesh(groundGeo, groundMat));
  cleanups.push(() => { groundGeo.dispose(); groundMat.dispose(); });
  if (catalogue) {
    const overlay = createDistrictOverlay(stage.scene, 50, environment.texture);
    const labels = document.createElement("div");
    labels.style.cssText = "display:grid;grid-template-columns:repeat(6,1fr);gap:8px;padding:12px;color:#c9c3b5;font:12px sans-serif";
    for (const [i, kind] of DISTRICT_BUILDING_KINDS.entries()) {
      const x = i % 8 - 3.5, z = Math.floor(i / 8) - 2;
      overlay.add({ kind, x, z, y: elevation(100 + x, 100 + z), foundation: true, operational: true });
      const label = document.createElement("div"); label.textContent = `${i + 1}. ${kind.replaceAll("_", " ")}`; labels.appendChild(label);
    }
    overlay.commit(); cleanups.push(overlay.dispose);
    const container = wrapWithCleanup(stage, cleanups); container.appendChild(labels); return container;
  }
  const { tiles, town: townTile, state } = fixtureFor(args);
  const map = createDistrictMap3D(stage.scene, 100, { state, origin: { camX: 100, camY: 100 },
    visibilityAt: () => "visible", cornerYAt: elevation, isHillsAt: () => false, hillCutAt: () => undefined, rise: 0.01 }, environment.texture);
  const town = createTownOverlay(stage.scene, 1, environment.texture);
  const townY = Math.max(elevation(100, 100), elevation(101, 100), elevation(100, 101), elevation(101, 101)) + 0.01;
  town.addInstance(0.5, 0.5, townY, args.tier); town.commit();
  for (const tile of tiles.values()) map.addTile(tile, { x: tile.x - 100 + 0.5, z: tile.y - 100 + 0.5, wx: tile.x, wy: tile.y, surfaceY: tile === townTile ? townY : elevation(tile.x, tile.y) }, performance.now());
  map.commit();
  let raf = 0;
  const tick = (): void => { map.update(performance.now()); raf = requestAnimationFrame(tick); };
  tick(); cleanups.push(map.dispose, town.dispose, () => cancelAnimationFrame(raf));
  return wrapWithCleanup(stage, cleanups);
};

const meta: Meta<Args> = {
  title: "Map/Structures/Town/District", parameters: { layout: "fullscreen" },
  args: { view: "district", radius: 2, tier: "METROPOLIS", slope: false, occupancy: "full", state: "active", yaw: 0 },
  argTypes: {
    view: { control: "inline-radio", options: ["district", "catalogue", "2D"] },
    radius: { control: "inline-radio", options: [1, 2] },
    tier: { control: "inline-radio", options: ["SETTLEMENT", "TOWN", "CITY", "GREAT_CITY", "METROPOLIS"] },
    slope: { control: "boolean" }, occupancy: { control: "inline-radio", options: ["full", "sparse"] },
    state: { control: "inline-radio", options: ["active", "construction", "removing", "inactive", "dormant"] },
    yaw: { control: { type: "range", min: -180, max: 180, step: 15 } }
  }, render
};
export default meta;
type Story = StoryObj<Args>;
export const FullDistrict: Story = {};
export const EveryBuilding: Story = { args: { view: "catalogue" } };
export const FirstRing: Story = { args: { radius: 1 } };
export const SlopedTerrain: Story = { args: { slope: true, occupancy: "sparse" } };
export const UnderConstruction: Story = { args: { state: "construction" } };
export const Dormant: Story = { args: { state: "dormant" } };
export const CanvasFallback: Story = { args: { view: "2D" } };
export const BeingRemoved: Story = { args: { state: "removing" } };
export const Inactive: Story = { args: { state: "inactive" } };
export const PerformanceComparison: Story = { render: () => renderDistrictBenchmark() };
export const ReducedQualityComparison: Story = { render: () => renderDistrictBenchmark(true) };
