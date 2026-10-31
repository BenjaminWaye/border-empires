import { PMREMGenerator } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { createTownOverlay } from "@client/client-map-3d-town-overlay.js";
import { createStructureOverlay } from "@client/client-map-3d-structure-overlay/client-map-3d-structure-overlay.js";
import { createContactShadowOverlay } from "@client/client-map-3d-contact-shadow/client-map-3d-contact-shadow.js";
import { createUmbriteExtractionRigOverlay } from "@client/client-map-3d-umbrite-extraction-rig.js";
import { createUmbriteWeaponsFactoryOverlay } from "@client/client-map-3d-umbrite-weapons-factory.js";
import { createTradeNexusOverlay } from "@client/client-map-3d-trade-nexus-overlay.js";
import { createAmbaricTransformerOverlay } from "@client/client-map-3d-ambaric-transformer-overlay.js";
import { addBuildingInstancesForTile } from "@client/client-map-3d/client-map-3d-building-instances.js";
import { createDistrictMap3D } from "@client/client-town-district/district-map-3d.js";
import { DISTRICT_BUILDING_KINDS } from "@client/client-town-district/district-catalog.js";
import { districtFixture } from "@client/client-town-district/district-fixtures.js";
import { createStage, wrapWithCleanup, type Stage } from "../../fixtures/three-stage.js";

// Synchronous WebGL finish measures completed CPU + GPU work on the same
// renderer and camera. This is a repeatable local comparison, not mobile
// hardware certification or a claim about the full game's frame budget.
const measure = (stage: Stage) => {
  const samples: number[] = [];
  const gl = stage.renderer.getContext();
  for (let i = 0; i < 80; i += 1) {
    const start = performance.now();
    stage.renderer.render(stage.scene, stage.camera); gl.finish();
    if (i >= 20) samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return { p50Ms: samples[30], p95Ms: samples[57],
    calls: stage.renderer.info.render.calls, triangles: stage.renderer.info.render.triangles,
    geometries: stage.renderer.info.memory.geometries, textures: stage.renderer.info.memory.textures };
};

const createFixture = (candidate: boolean, reduced: boolean) => {
  const stage = createStage({ width: 600, height: 450, camera: "orthographic", orthoHalfHeight: 3, background: "#536b39" });
  stage.camera.position.set(0.5, 8, 8); stage.camera.lookAt(0.5, 0, 0.5);
  stage.renderer.setPixelRatio(reduced ? 1 : Math.min(devicePixelRatio, 2));
  const pmrem = new PMREMGenerator(stage.renderer), room = new RoomEnvironment();
  const env = pmrem.fromScene(room); pmrem.dispose(); room.dispose();
  const fixture = districtFixture();
  let index = 0;
  for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) {
    if (!dx && !dy) continue;
    const kind = DISTRICT_BUILDING_KINDS[index++ % 17]!;
    const building = districtFixture(kind, dx, dy).building;
    fixture.tiles.set(`${building.x},${building.y}`, building);
  }
  const state = { tiles: fixture.tiles, tilesRevision: 1, me: "p1", selected: undefined, dormantStructures: [] };
  const town = createTownOverlay(stage.scene, 1, env.texture); town.addInstance(0.5, 0.5, 0.01, "METROPOLIS"); town.commit();
  const cleanup: Array<() => void> = [town.dispose, () => env.dispose()];
  const start = performance.now();
  if (candidate) {
    const map = createDistrictMap3D(stage.scene, 100, { state, origin: { camX: 100, camY: 100 },
      visibilityAt: () => "visible", cornerYAt: () => 0, isHillsAt: () => false, hillCutAt: () => undefined,
      rise: 0.01, qualityTier: reduced ? 1 : 0 }, env.texture);
    for (const tile of fixture.tiles.values()) map.addTile(tile,
      { x: tile.x - 100 + 0.5, z: tile.y - 100 + 0.5, wx: tile.x, wy: tile.y, surfaceY: 0.01 }, performance.now());
    map.commit(); cleanup.push(map.dispose);
  } else {
    const contactShadowOverlay = createContactShadowOverlay(stage.scene, 100);
    const structureOverlay = createStructureOverlay(stage.scene, 100, contactShadowOverlay, env.texture);
    const umbriteExtractionRigOverlay = createUmbriteExtractionRigOverlay(stage.scene, 100, env.texture);
    const umbriteWeaponsFactoryOverlay = createUmbriteWeaponsFactoryOverlay(stage.scene, 100, env.texture);
    const tradeNexusOverlay = createTradeNexusOverlay(stage.scene, 100);
    const ambaricTransformerOverlay = createAmbaricTransformerOverlay(stage.scene, 100);
    const overlays = { contactShadowOverlay, structureOverlay, umbriteExtractionRigOverlay,
      umbriteWeaponsFactoryOverlay, tradeNexusOverlay, ambaricTransformerOverlay,
      observatoryCooldownBadgeOverlay: { addInstance: () => {}, addSiphonModeInstance: () => {} } };
    for (const tile of fixture.tiles.values()) addBuildingInstancesForTile(tile,
      { x: tile.x - 100 + 0.5, z: tile.y - 100 + 0.5, wx: tile.x, wy: tile.y, surfaceY: 0.01 }, overlays, state, performance.now(), undefined);
    for (const overlay of [contactShadowOverlay, structureOverlay, umbriteExtractionRigOverlay,
      umbriteWeaponsFactoryOverlay, tradeNexusOverlay, ambaricTransformerOverlay]) {
      overlay.commit(); cleanup.push(overlay.dispose);
    }
  }
  const rebuildMs = performance.now() - start;
  const container = wrapWithCleanup(stage, cleanup);
  return { stage, container, rebuildMs };
};

export const renderDistrictBenchmark = (reduced = false): HTMLElement => {
  const root = document.createElement("div"); root.style.cssText = "padding:12px;color:#ddd;font:14px sans-serif;background:#172019";
  const button = document.createElement("button"); button.textContent = "Compare completed frame times";
  const output = document.createElement("pre"); output.style.whiteSpace = "pre-wrap";
  output.textContent = "24 ordinary support buildings. Left: existing models. Right: district kit and links. 20 warm-up + 60 measured frames per scene; gl.finish included.";
  const grid = document.createElement("div"); grid.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:8px";
  const baseline = createFixture(false, reduced), candidate = createFixture(true, reduced);
  grid.append(baseline.container, candidate.container); root.append(button, output, grid);
  button.onclick = () => {
    button.disabled = true; output.textContent = "Measuring completed frames…";
    requestAnimationFrame(() => {
      const before = measure(baseline.stage), after = measure(candidate.stage);
      output.textContent = JSON.stringify({ fixture: reduced ? "reduced-quality desktop" : "desktop",
        baseline: { ...before, coldRebuildMs: baseline.rebuildMs }, candidate: { ...after, coldRebuildMs: candidate.rebuildMs },
        p95ChangePercent: before.p95Ms && after.p95Ms ? 100 * (after.p95Ms / before.p95Ms - 1) : null }, null, 2);
      button.disabled = false;
    });
  };
  return root;
};
