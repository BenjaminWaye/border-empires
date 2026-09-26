import type { Meta, StoryObj } from "@storybook/html-vite";
import {
  ACESFilmicToneMapping,
  CanvasTexture,
  DirectionalLight,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Scene
} from "three";
import { createFabricationComplexOverlay } from "@client/client-map-3d-fabrication-complex.js";
import { createRiggingWorksModuleOverlay } from "@client/client-map-3d-rigging-works-module.js";
import { createTitaniumForgeModuleOverlay } from "@client/client-map-3d-titanium-forge-module.js";
import { createAetherResonanceModuleOverlay } from "@client/client-map-3d-aether-resonance-module.js";
import { createTranspositionArrayModuleOverlay } from "@client/client-map-3d-transposition-array-module.js";
import { createAetherwardCoilModuleOverlay } from "@client/client-map-3d-aetherward-coil-module.js";
import { createTidewayLatticeModuleOverlay } from "@client/client-map-3d-tideway-lattice-module.js";
import { createGeoformEngineModuleOverlay } from "@client/client-map-3d-geoform-engine-module.js";
import { createSiegeLensFoundryModuleOverlay, type SiegeLensFoundryModuleOverlay } from "@client/client-map-3d-siege-lens-foundry-module.js";
import { createGrassGround, createStage, wrapWithCleanup, type Stage } from "../three-stage.js";

type Args = {
  cameraDistance: number;
  // How many of the 8 Module_Sockets carry a spawned upgrade-module asset
  // (Siege Lens Foundry, Titanium Forge, Rigging Works, Aether Resonance Core,
  // Transposition Array, Aetherward Coil, Tideway Lattice and Geoform Engine
  // alternate around the ring; the rest stay as empty bays).
  modules: number;
};

// Keep the AFC aether core/chamber emitters and every docked module's lens
// core breathing in every story — the product's signature idle animation.
// Returns a cleanup.
export const startUpdateLoop = (overlays: ReadonlyArray<{ update: (nowMs: number) => void }>): (() => void) => {
  let rafId = 0;
  const animate = (): void => {
    const now = performance.now();
    for (const overlay of overlays) overlay.update(now);
    rafId = requestAnimationFrame(animate);
  };
  animate();
  return () => cancelAnimationFrame(rafId);
};

// A soft radial-contact-shadow disc flat on the ground so the 9-tile complex
// reads as firmly anchored instead of floating.
export const createContactShadow = (radius: number): { mesh: Mesh; dispose: () => void } => {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  const gradient = ctx.createRadialGradient(size / 2, size / 2, size * 0.08, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(8, 10, 14, 0.5)");
  gradient.addColorStop(0.55, "rgba(8, 10, 14, 0.28)");
  gradient.addColorStop(1, "rgba(8, 10, 14, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = "srgb";
  const geometry = new PlaneGeometry(1, 1);
  const material = new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
  const mesh = new Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.004;
  mesh.scale.set(radius * 2, radius * 2, 1);
  const dispose = (): void => { geometry.dispose(); material.dispose(); texture.dispose(); };
  return { mesh, dispose };
};

// Gameplay-context lighting (cool rim + back fill) so the dark iron and brass
// facets catch hard specular glints instead of flattening out.
export const glintStage = (opts: { cameraDistance: number; cameraTilt?: number }): Stage => {
  const stage = createStage({ cameraDistance: opts.cameraDistance, cameraTilt: opts.cameraTilt ?? 0.55, background: "#16181d" });
  stage.renderer.toneMapping = ACESFilmicToneMapping;
  stage.renderer.toneMappingExposure = 1.25;
  const rim = new DirectionalLight(0xcfe6ff, 1.6);
  rim.position.set(-7, 9, -10);
  stage.scene.add(rim);
  const back = new DirectionalLight(0xffffff, 0.8);
  back.position.set(-2, 6, 12);
  stage.scene.add(back);
  return stage;
};

// Asset-studio lighting for the orthographic hero shots: warm near-camera
// key, cool back rim, soft fill so the near-black steel never clips.
export const studioStage = (opts: { cameraDistance: number; cameraTilt?: number; orthoHalfHeight?: number; background: string }): Stage => {
  const stage = createStage({
    camera: "orthographic",
    cameraDistance: opts.cameraDistance,
    cameraTilt: opts.cameraTilt ?? 0.55,
    background: opts.background,
    ...(opts.orthoHalfHeight !== undefined ? { orthoHalfHeight: opts.orthoHalfHeight } : {})
  });
  stage.renderer.toneMapping = ACESFilmicToneMapping;
  stage.renderer.toneMappingExposure = 1.3;
  const key = new DirectionalLight(0xfff1dd, 2.2);
  key.position.set(3, 9, 7);
  stage.scene.add(key);
  const rim = new DirectionalLight(0xc2e1ff, 1.4);
  rim.position.set(-7, 6, -9);
  stage.scene.add(rim);
  const fill = new DirectionalLight(0xdbe6f2, 0.7);
  fill.position.set(8, 3, 9);
  stage.scene.add(fill);
  return stage;
};

// Builds a single AFC at the origin and docks real upgrade-module assets (one
// from each fabrication family) into the first `modules` sockets via the
// attachment-point API, returning a cleanup list.
const buildAfc = (scene: Scene, modules: number, withGrass: boolean, grassRadius: number): (() => void)[] => {
  const cleanups: (() => void)[] = [];
  if (withGrass) {
    const ground = createGrassGround(grassRadius, 1);
    scene.add(ground.group);
    cleanups.push(ground.dispose);
  } else {
    const shadow = createContactShadow(1.7);
    scene.add(shadow.mesh);
    cleanups.push(shadow.dispose);
  }
  const overlay = createFabricationComplexOverlay(scene, 1);
  const index = overlay.addInstance(0, 0, 0, 5, 5);
  overlay.commit();
  const lensModuleOverlay = createSiegeLensFoundryModuleOverlay(scene, 8);
  const forgeModuleOverlay = createTitaniumForgeModuleOverlay(scene, 8);
  const riggingModuleOverlay = createRiggingWorksModuleOverlay(scene, 8);
  const aetherModuleOverlay = createAetherResonanceModuleOverlay(scene, 8);
  const transpositionModuleOverlay = createTranspositionArrayModuleOverlay(scene, 8);
  const aetherwardModuleOverlay = createAetherwardCoilModuleOverlay(scene, 8);
  const tidewayModuleOverlay = createTidewayLatticeModuleOverlay(scene, 8);
  const geoformModuleOverlay = createGeoformEngineModuleOverlay(scene, 8);
  const count = Math.max(0, Math.min(modules, 8));
  overlay.moduleSocketAttachments(index).slice(0, count).forEach((attachment, i) => {
    // Alternate the eight production module families around the ring so a
    // mixed loadout is visible in one shot.
    const target =
      i % 8 === 0
        ? lensModuleOverlay
        : i % 8 === 1
          ? forgeModuleOverlay
          : i % 8 === 2
            ? riggingModuleOverlay
            : i % 8 === 3
              ? aetherModuleOverlay
              : i % 8 === 4
                ? transpositionModuleOverlay
                : i % 8 === 5
                  ? aetherwardModuleOverlay
                  : i % 8 === 6
                    ? tidewayModuleOverlay
                    : geoformModuleOverlay;
    target.addInstance(attachment.x, attachment.z, attachment.y, attachment.yaw, attachment.socketIndex + 1, 0);
  });
  lensModuleOverlay.commit();
  forgeModuleOverlay.commit();
  riggingModuleOverlay.commit();
  aetherModuleOverlay.commit();
  transpositionModuleOverlay.commit();
  aetherwardModuleOverlay.commit();
  tidewayModuleOverlay.commit();
  geoformModuleOverlay.commit();
  const updaters: Array<{ update: (nowMs: number) => void }> = [
    overlay,
    lensModuleOverlay,
    forgeModuleOverlay,
    riggingModuleOverlay,
    aetherModuleOverlay,
    transpositionModuleOverlay,
    aetherwardModuleOverlay,
    tidewayModuleOverlay,
    geoformModuleOverlay
  ];
  cleanups.push(
    startUpdateLoop(updaters),
    overlay.dispose,
    lensModuleOverlay.dispose,
    forgeModuleOverlay.dispose,
    riggingModuleOverlay.dispose,
    aetherModuleOverlay.dispose,
    transpositionModuleOverlay.dispose,
    aetherwardModuleOverlay.dispose,
    tidewayModuleOverlay.dispose,
    geoformModuleOverlay.dispose
  );
  return cleanups;
};

const meta: Meta<Args> = {
  title: "3D Library/FabricationComplex",
  argTypes: {
    cameraDistance: { control: { type: "range", min: 2, max: 18, step: 0.5 } },
    modules: { control: { type: "range", min: 0, max: 8, step: 1 } }
  },
  args: { cameraDistance: 9, modules: 6 }
};

export default meta;
type Story = StoryObj<Args>;

// The hero asset shot: the full 9-tile footprint on a light neutral studio
// backdrop, all eight bays populated with one of every module family,
// orthographic three-quarter camera — the way the asset reads in marketing/UI.
export const FabricationComplexHero: Story = {
  render: () => {
    const stage = studioStage({ cameraDistance: 6, orthoHalfHeight: 2.2, background: "#a6a3a1" });
    const cleanups = buildAfc(stage.scene, 8, false, 0);
    return wrapWithCleanup(stage, cleanups);
  }
};

export const FabricationComplexHeroDark: Story = {
  render: () => {
    const stage = studioStage({ cameraDistance: 6, orthoHalfHeight: 2.2, background: "#15161b" });
    const cleanups = buildAfc(stage.scene, 8, false, 0);
    return wrapWithCleanup(stage, cleanups);
  }
};

// All eight independent module docks populated — every socket on the ring is
// a live attachment hosting a module asset.
export const FullBays: Story = {
  render: () => {
    const stage = studioStage({ cameraDistance: 6, orthoHalfHeight: 2.2, background: "#15161b" });
    const cleanups = buildAfc(stage.scene, 8, false, 0);
    return wrapWithCleanup(stage, cleanups);
  }
};

// No modules installed — the "glowing industrial core + spider-like arms +
// eight empty circular bays" silhouette the complex advertises at rest.
export const EmptyBays: Story = {
  render: () => {
    const stage = studioStage({ cameraDistance: 6, orthoHalfHeight: 2.2, background: "#15161b" });
    const cleanups = buildAfc(stage.scene, 0, false, 0);
    return wrapWithCleanup(stage, cleanups);
  }
};

// In normal gameplay context on grass tiles, with the 3x3 tile hole its
// footprint spans — modules still pull their (x, y, z, yaw) from the socket
// attachment points.
export const OnGrass: Story = {
  render: () => {
    const stage = glintStage({ cameraDistance: 8, cameraTilt: 0.6 });
    const cleanups = buildAfc(stage.scene, 8, true, 2);
    return wrapWithCleanup(stage, cleanups);
  }
};

// Live module spawn/dock: scrub `modules` to pop upgrade modules (Siege Lens
// Foundry + Titanium Forge + Rigging Works + Aether Resonance Core +
// Transposition Array + Aetherward Coil + Tideway Lattice + Geoform Engine) into
// the first N
// sockets and back out — the procedural insertion/removal the identical
// Module_Sockets are built for.
export const ModularDocking: Story = {
  args: { cameraDistance: 9, modules: 4 },
  render: (args) => {
    const stage = studioStage({ cameraDistance: args.cameraDistance, orthoHalfHeight: 2.4, background: "#15161b" });
    const cleanups = buildAfc(stage.scene, args.modules, false, 0);
    return wrapWithCleanup(stage, cleanups);
  }
};