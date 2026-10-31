// Shared stage props and lighting rigs for 3D asset stories: the idle
// animation loop, a soft contact-shadow disc, and the gameplay ("glint") and
// asset-studio lighting setups.
import { ACESFilmicToneMapping, CanvasTexture, DirectionalLight, Mesh, MeshBasicMaterial, PlaneGeometry } from "three";
import { createStage, type Stage } from "./three-stage.js";

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

// A soft radial contact-shadow disc flat on the ground so a model on a bare
// studio backdrop reads as anchored instead of floating.
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
