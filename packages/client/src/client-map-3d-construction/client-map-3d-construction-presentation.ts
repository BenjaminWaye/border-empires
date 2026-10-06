import { Scene, type Texture } from "three";
import { CONSTRUCTION_PHASES, type ConstructionSite } from "../client-construction-phase/client-construction-phase.js";
import { createStructurePieceBuilder } from "../client-map-3d-structure-builder.js";
import { CONSTRUCTION_STACK_CENTER, createConstructionCrewLayer, MAX_CONSTRUCTION_SITES } from "./client-map-3d-construction-crew.js";
import { createConstructionPodFxLayer } from "./client-map-3d-construction-pod-fx.js";
import { registerConstructionScaffold } from "./client-map-3d-construction-scaffold.js";

// Everything that surrounds a structure under construction, apart from the
// structure's own (phase-gated) geometry: scaffolding, the parts stack and
// ancillary crew, and the delivery pod dropped at each new phase
// (docs/construction-animation-plan.md). One bundle so each 3D overlay that can
// show a construction site (the shared structure overlay, the Relay Beacon
// overlay, later forts) wires up the same five calls instead of re-deriving
// the pipeline.
export type ConstructionPresentation = {
  // Call once per site laid out in a rebuild. `structureHeight` is the finished
  // structure's height above the surface (scene units).
  readonly addSite: (sceneX: number, sceneZ: number, surfaceY: number, site: ConstructionSite, structureHeight: number) => void;
  readonly clear: () => void;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  // True once a phase boundary passed that changes what a site added in the last rebuild would lay out.
  readonly boundaryPassed: () => boolean;
  readonly dispose: () => void;
};

export const createConstructionPresentation = (scene: Scene, envMap?: Texture): ConstructionPresentation => {
  // Scaffold posts/bars go through a private piece builder (own InstancedMeshes), so this bundle never
  // depends on, or shares capacity with, the overlay that owns the structure's own pieces.
  const scaffoldBuilder = createStructurePieceBuilder(scene, MAX_CONSTRUCTION_SITES, envMap);
  const scaffold = registerConstructionScaffold(scaffoldBuilder.builder, MAX_CONSTRUCTION_SITES);
  const crew = createConstructionCrewLayer(scene);
  const pods = createConstructionPodFxLayer(scene);
  // Build phase each in-flight site had at the previous / current rebuild, to
  // spot a genuine phase change (a site scrolling into view, or a reconnect, has
  // no previous entry and so never fires a pod). Both hold only the sites laid
  // out in a single rebuild, so they are bounded by the visible window.
  let phasesLastRebuild = new Map<string, number>();
  let phasesThisRebuild = new Map<string, number>();
  let earliestPhaseAtMs = Infinity;

  const addSite: ConstructionPresentation["addSite"] = (sceneX, sceneZ, surfaceY, site, structureHeight) => {
    scaffold.place(sceneX, surfaceY, sceneZ, structureHeight, site.visibleBands, CONSTRUCTION_PHASES);
    crew.add(sceneX, sceneZ, surfaceY, site);
    if (site.nextPhaseAtMs !== undefined) earliestPhaseAtMs = Math.min(earliestPhaseAtMs, site.nextPhaseAtMs);
    const siteKey = `${site.x},${site.y}`;
    phasesThisRebuild.set(siteKey, site.phase);
    const previousPhase = phasesLastRebuild.get(siteKey);
    // A new phase brings a fresh delivery of fabricated parts (build only).
    if (site.direction === "build" && !site.stalled && previousPhase !== undefined && site.phase > previousPhase) {
      pods.spawn(sceneX + CONSTRUCTION_STACK_CENTER.x, sceneZ + CONSTRUCTION_STACK_CENTER.z, surfaceY, performance.now());
    }
  };

  return {
    addSite,
    clear: (): void => {
      scaffoldBuilder.clear();
      crew.clear();
      // Pods already in flight are deliberately NOT cleared: a rebuild happens at
      // the very phase boundary that spawns one.
      phasesLastRebuild = phasesThisRebuild;
      phasesThisRebuild = new Map();
      earliestPhaseAtMs = Infinity;
    },
    commit: (): void => scaffoldBuilder.commit(),
    update: (nowMs: number): void => {
      crew.update(nowMs);
      pods.update(nowMs);
    },
    boundaryPassed: (): boolean => Date.now() >= earliestPhaseAtMs,
    dispose: (): void => {
      crew.dispose();
      pods.dispose();
      scaffoldBuilder.dispose();
    }
  };
};
