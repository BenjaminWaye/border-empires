import { ACESFilmicToneMapping, PMREMGenerator } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { attachSceneLabels } from "../../fixtures/scene-labels.js";
import { createGrassGround, createStage, wrapWithCleanup } from "../../fixtures/three-stage.js";
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
  if (labelled.length > 0) {
    cleanups.push(attachSceneLabels(container, stage, labelled.map((p) => ({ text: p.label ?? "", x: p.x, z: p.z + 0.55 }))));
  }
  return container;
};
