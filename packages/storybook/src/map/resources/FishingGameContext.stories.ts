import type { Meta, StoryObj } from "@storybook/html-vite";
import { Box3, Mesh, MeshStandardMaterial, PCFSoftShadowMap } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createHeightfield, type HeightfieldTerrainKind } from "@client/client-map-3d-heightfield/client-map-3d-heightfield.js";
import { createWaterSurface } from "@client/client-map-3d-water-surface.js";
import { createForest } from "@client/client-map-3d-forest.js";
import { createFarmlandOverlay } from "@client/client-map-3d-farmland/client-map-3d-farmland.js";
import { createTownOverlay } from "@client/client-map-3d-town-overlay.js";
import { createDistrictOverlay } from "@client/client-town-district/district-overlay.js";
import { fishingModelFitMatrix } from "@client/client-map-3d-fishing/client-map-3d-fishing.js";
import { applyBuildingEnvMap } from "@client/client-map-3d-building-envmap/client-map-3d-building-envmap.js";
import { createResourcePreviewAtmosphere } from "../../fixtures/resource-preview-atmosphere.js";
import { createFishStudyApronMaterial } from "../../fixtures/fish-study-apron-material.js";
import { createFishStudyFoundation } from "../../fixtures/fish-study-foundation.js";
import { createStage, wrapWithCleanup } from "../../fixtures/three-stage.js";

type Args = { cameraDistance: number; compact: boolean };
const CENTER = 100;
const kindAt = (x: number, z: number): HeightfieldTerrainKind => {
  const coast = 1 + (z < CENTER - 2 ? 1 : 0);
  return x - CENTER >= coast + 1 ? "SEA" : x - CENTER >= coast ? "COASTAL_SEA" : "GRASS";
};

const render = ({ cameraDistance, compact }: Args): HTMLElement => {
  const stage = createStage({ width: 1440, height: 900, cameraDistance, cameraTilt: 0.6 });
  for (const child of [...stage.scene.children]) stage.scene.remove(child);
  stage.camera.position.x += 0.1;
  stage.camera.position.z += 0.5;
  stage.camera.lookAt(0.1, 0, 0.5);
  stage.renderer.shadowMap.enabled = true;
  stage.renderer.shadowMap.type = PCFSoftShadowMap;
  const atmosphere = createResourcePreviewAtmosphere(stage.scene, stage.renderer);
  atmosphere.updateShadowFrame(3);
  atmosphere.updateShadowTarget(0.5, 0.5);
  const terrain = createHeightfield();
  terrain.rebuild({ camX: CENTER, camY: CENTER, halfW: 16, halfH: 16,
    worldWidth: 240, worldHeight: 240, tileKindAt: kindAt });
  terrain.setGridlinesVisible(true);
  terrain.mesh.receiveShadow = true;
  stage.scene.add(terrain.mesh, terrain.skirtMesh, terrain.gridlines);
  const corners = (x: number, z: number): readonly [number, number, number, number] => [
    terrain.cornerYAt(CENTER + x, CENTER + z), terrain.cornerYAt(CENTER + x + 1, CENTER + z),
    terrain.cornerYAt(CENTER + x, CENTER + z + 1), terrain.cornerYAt(CENTER + x + 1, CENTER + z + 1)
  ];
  const surface = (x: number, z: number): number => Math.max(terrain.elevationAt(CENTER + x, CENTER + z), ...corners(x, z));
  const water = createWaterSurface(stage.scene, 33 * 33);
  for (let z = -16; z <= 16; z++) for (let x = -16; x <= 16; x++) {
    const kind = kindAt(CENTER + x, CENTER + z);
    if (kind === "SEA" || kind === "COASTAL_SEA") water.addTile(x + 0.5, z + 0.5, kind === "COASTAL_SEA", CENTER + x, CENTER + z);
  }
  water.commit();
  const towns = createTownOverlay(stage.scene, 1, atmosphere.buildingEnvironmentTexture);
  towns.addInstance(-1.5, -0.5, surface(-2, -1), "TOWN", CENTER - 2, CENTER - 1);
  towns.commit();
  const districts = createDistrictOverlay(stage.scene, 2, atmosphere.buildingEnvironmentTexture);
  districts.add({ x: -0.5, z: -0.5, y: surface(-1, -1), kind: "MANUFACTORY", operational: true, foundation: true });
  districts.add({ x: 0.5, z: -1.5, y: surface(0, -2), kind: "HYDROWORKS", operational: true, foundation: true });
  districts.commit();
  const farms = createFarmlandOverlay(stage.scene, 3, atmosphere.buildingEnvironmentTexture);
  for (const [x, z] of [[-2, 1], [-3, 1], [-3, 0]] as const) farms.addInstance(x + 0.5, z + 0.5, surface(x, z), CENTER + x, CENTER + z);
  farms.commit();
  const forest = createForest(stage.scene, 12);
  for (const [x, z] of [[-4, -2], [-3, -3], [-2, -3], [-1, -4], [0, -4], [-4, 0], [-4, 2], [-3, 3], [-2, 3], [-1, 3], [0, 4], [-5, 1]] as const) {
    forest.addInstance(x + 0.5, z + 0.5, surface(x, z), CENTER + x, CENTER + z);
  }
  forest.commit();
  const foundation = createFishStudyFoundation(corners(0, 0), compact ? { inset: 0.132, lift: 0.003 } : {});
  const apronFinish = compact ? createFishStudyApronMaterial() : undefined;
  const foundationMaterial = apronFinish?.material ?? new MeshStandardMaterial({ color: "#8e9088", roughness: 0.94 });
  const apron = new Mesh(foundation.geometry, foundationMaterial);
  apron.receiveShadow = true;
  stage.scene.add(apron);
  let disposed = false;
  let releaseModel = (): void => {};
  new GLTFLoader().load(compact ? "/studies/fishing-style-compact.glb" : "/studies/fishing-style-proposal.glb", gltf => {
    const model = gltf.scene;
    model.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(model, true);
    if (compact) {
      // The Blender export already uses tile units. Re-fitting would enlarge the basins.
      model.position.set(0.5 - (bounds.min.x + bounds.max.x) / 2,
        foundation.topY + 0.001 - bounds.min.y, 0.5 - (bounds.min.z + bounds.max.z) / 2);
    } else {
      model.applyMatrix4(fishingModelFitMatrix(bounds));
      model.position.set(0.5, foundation.topY + 0.001, 0.5);
    }
    model.traverse(node => {
      if (!(node instanceof Mesh)) return;
      node.castShadow = node.receiveShadow = true;
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        if (material instanceof MeshStandardMaterial) applyBuildingEnvMap(material, atmosphere.buildingEnvironmentTexture);
      }
    });
    releaseModel = () => model.traverse(node => {
      if (!(node instanceof Mesh)) return;
      node.geometry.dispose();
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.dispose();
    });
    if (disposed) releaseModel(); else stage.scene.add(model);
  });
  let raf = 0;
  const tick = (): void => {
    water.tick(performance.now());
    districts.update(performance.now());
    raf = requestAnimationFrame(tick);
  };
  tick();
  const container = wrapWithCleanup(stage, [() => {
    disposed = true; cancelAnimationFrame(raf); releaseModel(); foundation.geometry.dispose();
    if (apronFinish) apronFinish.dispose(); else foundationMaterial.dispose();
  }, terrain.dispose, atmosphere.dispose, water.dispose, towns.dispose, districts.dispose, farms.dispose, forest.dispose]);
  const label = document.createElement("div");
  label.textContent = compact ? "FISHING SITE · compact layout · same size basins · preview" : "FISHING SITE · previous footprint · preview";
  label.style.cssText = "position:absolute;left:20px;top:18px;padding:10px 14px;background:#17201de6;color:#e3dfce;font:13px system-ui;pointer-events:none;border:1px solid #777a8066";
  container.appendChild(label);
  return container;
};

const meta: Meta<Args> = {
  title: "Map/Resources/Fishing game context", render, parameters: { layout: "fullscreen" },
  args: { cameraDistance: 8.5, compact: true }, argTypes: { compact: { control: "boolean" }, cameraDistance: { control: { type: "range", min: 3, max: 38, step: 0.5 } } }
};
export default meta;
type Story = StoryObj<Args>;
export const CoastalSettlement: Story = {};
export const CloseUp: Story = { args: { cameraDistance: 4.5 } };
export const GameplayZoom: Story = { args: { cameraDistance: 38 } };

export const PreviousFootprint: Story = { args: { cameraDistance: 4.5, compact: false } };
