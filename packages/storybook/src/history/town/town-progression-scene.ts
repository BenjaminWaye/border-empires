import { ACESFilmicToneMapping, PMREMGenerator, Vector3, type Camera } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { createGrassGround, createStage, wrapWithCleanup } from "../../three-stage.js";
import type { HistoricTownTier, TownEra } from "./town-eras.js";

export type TownPlacement = {
  readonly era: TownEra;
  readonly tier: HistoricTownTier;
  readonly x: number;
  readonly z: number;
  /** Shown under the town when set. */
  readonly label?: string;
};

export type TownProgressionSceneOptions = {
  readonly placements: readonly TownPlacement[];
  readonly cameraDistance: number;
  readonly cameraTilt: number;
  readonly grass: boolean;
  readonly groundRadius: number;
};

// GLB eras fall back to procedural towns until their models arrive, so the
// layout is rebuilt a few times while assets stream in.
const ASSET_RELAYOUT_INTERVAL_MS = 500;
const ASSET_RELAYOUT_WINDOW_MS = 8000;

/** Builds every placement with its era's own overlay on one stage, lit with the game's PMREM room environment. */
export const renderTownProgressionScene = (opts: TownProgressionSceneOptions): HTMLElement => {
  const stage = createStage({ cameraDistance: opts.cameraDistance, cameraTilt: opts.cameraTilt, background: "#1e2538" });
  stage.renderer.toneMapping = ACESFilmicToneMapping;
  stage.renderer.toneMappingExposure = 1.1;
  const pmrem = new PMREMGenerator(stage.renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const cleanups: Array<() => void> = [() => envMap.dispose(), () => pmrem.dispose()];

  if (opts.grass) {
    const ground = createGrassGround(opts.groundRadius);
    stage.scene.add(ground.group);
    cleanups.push(ground.dispose);
  }

  const byEra = new Map<TownEra, TownPlacement[]>();
  for (const placement of opts.placements) byEra.set(placement.era, [...(byEra.get(placement.era) ?? []), placement]);
  const layouts = [...byEra].map(([era, placements]) => {
    const overlay = era.create(stage.scene, placements.length, envMap);
    cleanups.push(overlay.dispose);
    const layout = (): void => {
      overlay.clear();
      placements.forEach((p, i) => overlay.addInstance(p.x, p.z, 0, p.tier, i * 7, i * 3));
      overlay.commit();
    };
    layout();
    return { era, layout };
  });

  const streaming = layouts.filter((l) => l.era.loadsAssets);
  if (streaming.length > 0) {
    const startedAt = performance.now();
    const timer = window.setInterval(() => {
      for (const l of streaming) l.layout();
      if (performance.now() - startedAt > ASSET_RELAYOUT_WINDOW_MS) window.clearInterval(timer);
    }, ASSET_RELAYOUT_INTERVAL_MS);
    cleanups.push(() => window.clearInterval(timer));
  }

  // wrapWithCleanup keeps the array by reference, so the label loop pushed
  // below is still torn down with the stage.
  const container = wrapWithCleanup(stage, cleanups);
  const labelled = opts.placements.filter((p) => p.label !== undefined);
  if (labelled.length > 0) cleanups.push(attachLabels(container, stage.canvas, stage.camera, labelled));
  return container;
};

// DOM captions pinned under each town by projecting its position every frame.
const attachLabels = (
  container: HTMLElement,
  canvas: HTMLCanvasElement,
  camera: Camera,
  placements: readonly TownPlacement[]
): (() => void) => {
  const projected = new Vector3();
  const labels = placements.map((p) => {
    const el = document.createElement("div");
    el.textContent = p.label ?? "";
    el.style.cssText =
      "position:absolute;transform:translate(-50%,0);pointer-events:none;white-space:pre;text-align:center;" +
      "font:11px/1.3 system-ui,sans-serif;color:#e8ecf4;text-shadow:0 1px 2px #000;";
    container.appendChild(el);
    return { el, p };
  });
  let rafId = 0;
  const place = (): void => {
    for (const { el, p } of labels) {
      projected.set(p.x, 0, p.z + 0.55).project(camera);
      el.style.left = `${((projected.x + 1) / 2) * canvas.clientWidth}px`;
      el.style.top = `${((1 - projected.y) / 2) * canvas.clientHeight}px`;
    }
    rafId = requestAnimationFrame(place);
  };
  place();
  return () => cancelAnimationFrame(rafId);
};
