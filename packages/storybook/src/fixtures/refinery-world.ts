// Shared world for the Map / Structures / Refineries stories: the client's
// refinery fixture map (a City at (100, 100), a 3-tile Titanium field to the
// east, an unlinked deposit behind unowned land, a Gems deposit) drawn with
// the real client renderers -- the 2D district canvas (supply line, goods,
// picker highlight), the real deposit / refined-deposit art, the true-3D
// district map (pipes, loads, refinery model), the raw-resource dispatch
// (bare deposit vs the refined Mine model) and the "needs a field" toasts.
import { Mesh, MeshStandardMaterial, PlaneGeometry, PMREMGenerator, Vector3 } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { Tile } from "@client/client-types.js";
import type { ClientState } from "@client/client-state/client-state.js";
import { REFINERY_FIXTURE_ME, REFINERY_FIXTURE_RIVAL, placeRefineryFixture, refineryFixtureGrid } from "@client/client-refineries/refinery-fixtures.js";
import { resetRefineryScene } from "@client/client-refineries/refinery-scene.js";
import { createRefineryFieldToasts } from "@client/client-refineries/refinery-field-toasts.js";
import { setRefineryPickerHighlight } from "@client/client-refineries/refinery-picker-highlight.js";
import { createDistrictCanvas } from "@client/client-town-district/district-canvas.js";
import { createDistrictMap3D } from "@client/client-town-district/district-map-3d.js";
import { districtArtUrl } from "@client/client-town-district/district-art.js";
import { builtResourceOverlayForTile, resourceOverlayForTile } from "@client/client-map-render/client-map-render-resource-overlays.js";
import { addRawResourceInstance, type RawResourceOverlays } from "@client/client-map-3d-raw-resource-dispatch/client-map-3d-raw-resource-dispatch.js";
import { createTownOverlay } from "@client/client-map-3d-town-overlay.js";
import { createStructureOverlay } from "@client/client-map-3d-structure-overlay/client-map-3d-structure-overlay.js";
import { createContactShadowOverlay } from "@client/client-map-3d-contact-shadow/client-map-3d-contact-shadow.js";
import { createTitaniumDepositOverlay } from "@client/client-map-3d-titanium-deposit.js";
import { createResourceOverlay } from "@client/client-map-3d-resource-overlay.js";
import { createUmbriteExtractionRigOverlay } from "@client/client-map-3d-umbrite-extraction-rig.js";
import { createUmbriteDepositOverlay } from "@client/client-map-3d-umbrite-deposit.js";
import { createRefineryHighlight3D } from "@client/client-refineries/refinery-highlight-3d.js";
import { openRefineryBuildPicker } from "@client/client-refineries/refinery-picker-flow.js";
import { createStage, wrapWithCleanup } from "./three-stage.js";

export type RefineryWorldVariant = "working" | "broken" | "unassigned" | "picker";

export type RefineryWorld = { tiles: Map<string, Tile>; refinery: Tile; state: Pick<ClientState, "tiles" | "tilesRevision" | "me" | "selected" | "camX" | "camY" | "dormantStructures" | "authSessionReady" | "profileSetupRequired"> };

let revision = 1;

/**
 * Opens the real field picker for a second Titanium Refinery built from the
 * town: the east field is taken by the first, the far deposit is unlinked and
 * two small western fields are free, so every highlight state shows.
 */
export const openRefineryWorldPicker = (world: RefineryWorld): void => {
  world.tiles.set("96,104", { ...world.tiles.get("96,104")!, resource: "TITANIUM" });
  world.state.tilesRevision += 1;
  openRefineryBuildPicker("TITANIUM_REFINERY", world.tiles.get("100,100")!, { state: world.state, buildRefinery: () => true, sendGameMessage: () => true });
};

/** The fixture map in one of the story states. Every call bumps the tile revision so the client's caches recompute. */
export const refineryWorld = (variant: RefineryWorldVariant): RefineryWorld => {
  resetRefineryScene();
  setRefineryPickerHighlight(undefined);
  const tiles = refineryFixtureGrid();
  // A second Titanium field (one tile) north-west of the town, and a booster on the ring.
  tiles.set("96,96", { ...tiles.get("96,96")!, resource: "TITANIUM" });
  placeRefineryFixture(tiles, 99, 101, "TITANIUM_SMELTER");
  tiles.get("99,99")!.economicStructure = { type: "MANUFACTORY", ownerId: REFINERY_FIXTURE_ME, status: "active", supportAnchor: { x: 100, y: 100 } };
  const refinery = placeRefineryFixture(tiles, 101, 100, "TITANIUM_REFINERY", variant === "unassigned" ? {} : { field: { x: 106, y: 99 } });
  if (variant === "broken") {
    // A rival captured a band of land between the town and its field.
    for (let y = 96; y <= 104; y += 1) Object.assign(tiles.get(`104,${y}`)!, { ownerId: REFINERY_FIXTURE_RIVAL, ownershipState: "SETTLED" });
  }
  revision += 1;
  return { tiles, refinery, state: { tiles, tilesRevision: revision, me: REFINERY_FIXTURE_ME, selected: undefined, camX: 103, camY: 100, dormantStructures: [], authSessionReady: true, profileSetupRequired: false } };
};

const GROUND: Record<string, string> = { own: "#5f7a3f", rival: "#7a4a44", neutral: "#71795c", sea: "#2c5a78" };
const groundColor = (tile: Tile): string => tile.terrain !== "LAND" ? GROUND.sea! : tile.ownerId === REFINERY_FIXTURE_ME ? GROUND.own! : tile.ownerId ? GROUND.rival! : GROUND.neutral!;

const imageCache = new Map<string, HTMLImageElement>();
const image = (src: string): HTMLImageElement => {
  let cached = imageCache.get(src);
  if (!cached) { cached = new Image(); cached.src = src; imageCache.set(src, cached); }
  return cached;
};

/** The 2D map: ground, the district canvas (lines, goods, picker highlight), deposit and building art, and the toast layer. */
export const renderRefineryWorld2D = (world: RefineryWorld, opts: { width?: number; height?: number; size?: number } = {}): HTMLElement => {
  const width = opts.width ?? 1040, height = opts.height ?? 640, size = opts.size ?? 64;
  const halfW = Math.floor(width / size / 2), halfH = Math.floor(height / size / 2);
  const host = document.createElement("div");
  host.style.cssText = `position:relative;width:${width}px;height:${height}px;background:#1d2420`;
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  host.append(canvas);
  const ctx = canvas.getContext("2d")!;
  const { state } = world;
  const worldToScreen = (x: number, y: number, tileSize: number): { sx: number; sy: number } =>
    ({ sx: (x - state.camX + halfW + 0.5) * tileSize, sy: (y - state.camY + halfH + 0.5) * tileSize });
  const district = createDistrictCanvas({ state, ctx, visibilityAt: () => "visible", terrainAt: () => "LAND", worldToScreen });
  const toasts = createRefineryFieldToasts(canvas, state, () => true);
  let frame = 0;
  const paint = (): void => {
    const plots = district.plots(false);
    ctx.fillStyle = "#1d2420"; ctx.fillRect(0, 0, width, height);
    const visible: Array<{ wx: number; wy: number; wk: string; px: number; py: number; vis: string; t?: Tile }> = [];
    for (const tile of world.tiles.values()) {
      const { sx, sy } = worldToScreen(tile.x - 0.5, tile.y - 0.5, size);
      ctx.fillStyle = groundColor(tile); ctx.fillRect(sx, sy, size, size);
      ctx.strokeStyle = "rgba(0,0,0,0.18)"; ctx.strokeRect(sx + 0.5, sy + 0.5, size - 1, size - 1);
      if (plots.has(`${tile.x},${tile.y}`)) { ctx.strokeStyle = "rgba(255,240,181,0.35)"; ctx.strokeRect(sx + 3, sy + 3, size - 6, size - 6); }
      visible.push({ wx: tile.x, wy: tile.y, wk: `${tile.x},${tile.y}`, px: sx, py: sy, vis: "visible", t: tile });
    }
    district.draw(size, halfW, halfH);
    for (const tile of world.tiles.values()) {
      const { sx, sy } = worldToScreen(tile.x - 0.5, tile.y - 0.5, size);
      const art = tile.town ? undefined : tile.economicStructure ? image(districtArtUrl(tile.economicStructure.type) ?? "") : builtResourceOverlayForTile(tile) ?? resourceOverlayForTile(tile);
      if (art?.complete && art.naturalWidth) ctx.drawImage(art, sx, sy, size, size);
      if (tile.town) {
        ctx.fillStyle = "#3f4249"; ctx.fillRect(sx + 8, sy + 8, size - 16, size - 16);
        ctx.strokeStyle = "#d2af6d"; ctx.lineWidth = 2; ctx.strokeRect(sx + 8, sy + 8, size - 16, size - 16); ctx.lineWidth = 1;
        ctx.fillStyle = "#fff0b5"; ctx.font = "12px sans-serif"; ctx.textAlign = "center"; ctx.fillText("CITY", sx + size / 2, sy + size / 2 + 4);
      }
    }
    toasts.render(visible, { size, project: (x, y) => worldToScreen(x, y, size) });
    frame = requestAnimationFrame(paint);
  };
  paint();
  // Stop animating once Storybook unmounts the story.
  const observer = new MutationObserver(() => { if (!host.isConnected) { cancelAnimationFrame(frame); toasts.dispose(); observer.disconnect(); } });
  queueMicrotask(() => observer.observe(document.body, { childList: true, subtree: true }));
  return host;
};

/** The true-3D map: the town, its district (refinery, booster, pipes and loads), bare and refined deposits, and toasts. */
export const renderRefineryWorld3D = (world: RefineryWorld, opts: { zoom?: number } = {}): HTMLElement => {
  const stage = createStage({ width: 1040, height: 640, camera: "orthographic", orthoHalfHeight: 4.2 / (opts.zoom ?? 1), background: "#1d2420", cameraDistance: 12 });
  stage.camera.position.set(3 + 4, 7.5, 7.5); stage.camera.lookAt(3, 0, 0);
  const pmrem = new PMREMGenerator(stage.renderer), room = new RoomEnvironment();
  const environment = pmrem.fromScene(room); room.dispose(); pmrem.dispose();
  const origin = { camX: 100, camY: 100 };
  const cleanups: Array<() => void> = [() => environment.dispose()];
  const groundGeometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const materials = new Map<string, MeshStandardMaterial>();
  for (const tile of world.tiles.values()) {
    const color = groundColor(tile);
    let material = materials.get(color);
    if (!material) { material = new MeshStandardMaterial({ color, roughness: 0.95 }); materials.set(color, material); }
    const plate = new Mesh(groundGeometry, material);
    plate.position.set(tile.x - origin.camX + 0.5, 0, tile.y - origin.camY + 0.5); plate.scale.setScalar(0.985);
    stage.scene.add(plate);
  }
  cleanups.push(() => { groundGeometry.dispose(); for (const material of materials.values()) material.dispose(); });
  const town = createTownOverlay(stage.scene, 1, environment.texture);
  town.addInstance(0.5, 0.5, 0, "CITY"); town.commit();
  const map = createDistrictMap3D(stage.scene, 64, { state: world.state, origin, visibilityAt: () => "visible", cornerYAt: () => 0, isHillsAt: () => false, hillCutAt: () => undefined, rise: 0 }, environment.texture);
  map.clear({ ...origin, halfW: 12, halfH: 8 });
  const shadows = createContactShadowOverlay(stage.scene, 32);
  const structures = createStructureOverlay(stage.scene, 16, shadows, environment.texture);
  const rig = createUmbriteExtractionRigOverlay(stage.scene, 8, environment.texture);
  const titanium = createTitaniumDepositOverlay(stage.scene, 16, environment.texture);
  const umbrite = createUmbriteDepositOverlay(stage.scene, 8, environment.texture);
  const generic = createResourceOverlay(stage.scene, 8, environment.texture);
  const overlays: RawResourceOverlays = {
    farmland: { addInstance: () => undefined }, fishing: { addInstance: () => undefined },
    titaniumDeposit: titanium, umbriteDeposit: umbrite, generic,
    refined: { addInstance: (x, z, y, resource, wx, wy) => resource === "UMBRITE" ? rig.addInstance(x, z, y, wx, wy) : structures.addInstance(x, z, y, "MINE", resource) }
  };
  for (const tile of world.tiles.values()) {
    const x = tile.x - origin.camX + 0.5, z = tile.y - origin.camY + 0.5;
    if (tile.economicStructure || tile.town) map.addTile(tile, { x, z, wx: tile.x, wy: tile.y, surfaceY: 0 }, performance.now());
    if (tile.resource === "TITANIUM" || tile.resource === "GEMS" || tile.resource === "UMBRITE") {
      addRawResourceInstance(overlays, tile.resource, tile, { sceneX: x, sceneZ: z, surfaceY: 0, flatOverlayY: 0, worldTileX: tile.x, worldTileY: tile.y }, () => undefined);
    }
  }
  map.commit(origin);
  for (const overlay of [titanium, umbrite, generic, structures, rig]) overlay.commit();
  const container = wrapWithCleanup(stage, cleanups);
  const toasts = createRefineryFieldToasts(stage.canvas, world.state, () => true);
  const highlight = createRefineryHighlight3D(stage.scene);
  let raf = 0;
  const tick = (): void => {
    map.update(performance.now());
    highlight.sync({ state: world.state, sceneOrigin: origin, tileVisibilityStateAt: () => "visible", cornerYAt: () => 0 });
    const projected = new Vector3(world.refinery.x - origin.camX + 0.5, 0.25, world.refinery.y - origin.camY + 0.5).project(stage.camera);
    const sx = (projected.x + 1) / 2 * stage.canvas.width, sy = (1 - projected.y) / 2 * stage.canvas.height;
    toasts.render([{ wx: world.refinery.x, wy: world.refinery.y, wk: `${world.refinery.x},${world.refinery.y}`, px: sx - 32, py: sy - 32, vis: "visible", t: world.refinery }], { size: 64, project: () => ({ sx, sy }) });
    raf = requestAnimationFrame(tick);
  };
  tick();
  cleanups.push(() => cancelAnimationFrame(raf), highlight.dispose, toasts.dispose, map.dispose, town.dispose, structures.dispose, shadows.dispose, rig.dispose, titanium.dispose, umbrite.dispose, generic.dispose);
  return container;
};
