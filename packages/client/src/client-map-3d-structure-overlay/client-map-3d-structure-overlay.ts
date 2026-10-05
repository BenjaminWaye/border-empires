import type { Scene, Texture } from "three";
import { createStructurePieceBuilder } from "../client-map-3d-structure-builder.js";
import {
  DEFAULT_CONTACT_SHADOW_RADIUS_TILES,
  type ContactShadowOverlay
} from "../client-map-3d-contact-shadow/client-map-3d-contact-shadow.js";
import {
  ECONOMIC_STRUCTURE_KINDS,
  registerEconomicStructures,
  type EconomicStructureKind,
  type StructureResourceHint
} from "../client-map-3d-structure-economic.js";
import {
  LATE_GAME_STRUCTURE_KINDS,
  registerLateGameStructures,
  type LateGameStructureKind
} from "../client-map-3d-structure-late-game.js";
import {
  CIVIC_STRUCTURE_KINDS,
  registerCivicStructures,
  type CivicStructureKind
} from "../client-map-3d-structure-civic.js";
import {
  INFRASTRUCTURE_STRUCTURE_KINDS,
  registerInfrastructureStructures,
  type InfrastructureStructureKind
} from "../client-map-3d-structure-infrastructure.js";
import {
  INDUSTRIAL_STRUCTURE_KINDS,
  registerIndustrialStructures,
  type IndustrialStructureKind
} from "../client-map-3d-structure-industrial.js";
import {
  MANPOWER_STRUCTURE_KINDS,
  registerManpowerStructures,
  type ManpowerStructureKind
} from "../client-map-3d-structure-manpower.js";
import {
  WORLDBREAKER_PART_STRUCTURE_KINDS,
  registerWorldbreakerPartStructures,
  type WorldbreakerPartStructureKind
} from "../client-map-3d-structure-worldbreaker-part.js";
import {
  IMPERIAL_EXCHANGE_PART_STRUCTURE_KINDS,
  registerImperialExchangePartStructures,
  type ImperialExchangePartStructureKind
} from "../client-map-3d-structure-imperial-exchange-part.js";
import {
  ASTRAL_DOCK_PART_STRUCTURE_KINDS,
  registerAstralDockPartStructures,
  type AstralDockPartStructureKind
} from "../client-map-3d-structure-astral-dock-part.js";
import {
  POPULATION_BUREAU_PART_STRUCTURE_KINDS,
  registerPopulationBureauPartStructures,
  type PopulationBureauPartStructureKind
} from "../client-map-3d-structure-population-bureau-part.js";
import { CONSTRUCTION_PHASES, type ConstructionSite } from "../client-construction-phase/client-construction-phase.js";
import { CONSTRUCTION_STACK_CENTER, createConstructionCrewLayer, MAX_CONSTRUCTION_SITES } from "../client-map-3d-construction/client-map-3d-construction-crew.js";
import { createConstructionPodFxLayer } from "../client-map-3d-construction/client-map-3d-construction-pod-fx.js";
import { registerConstructionScaffold } from "../client-map-3d-construction/client-map-3d-construction-scaffold.js";

// 3D economic-structure overlay. The per-family files (economic,
// late-game, civic, infrastructure, industrial) each own their
// materials/geometries/layouts and register slots with a shared
// piece-builder. This file just composes them, dispatches addInstance
// by kind, and exposes the StructureOverlay surface to the
// orchestrator in client-map-3d.ts.
//
// Status: under_construction / removing structures are drawn through the
// construction pipeline (docs/construction-animation-plan.md) -- pieces gated
// by build phase, scaffolding, a parts stack and an ancillary crew. Other
// statuses (active / inactive) render fully.
//
// OBSERVATORY is wired via `tile.observatory` (not `economicStructure`)
// — the orchestrator side calls addInstance with kind="OBSERVATORY"
// whenever the tile carries an observatory record.

export type StructureKind =
  | EconomicStructureKind
  | LateGameStructureKind
  | CivicStructureKind
  | InfrastructureStructureKind
  | IndustrialStructureKind
  | ManpowerStructureKind
  | WorldbreakerPartStructureKind
  | ImperialExchangePartStructureKind
  | AstralDockPartStructureKind
  | PopulationBureauPartStructureKind;

export type { StructureResourceHint } from "../client-map-3d-structure-economic.js";

export const STRUCTURE_KINDS_HANDLED_BY_3D: ReadonlySet<StructureKind> = new Set<StructureKind>([
  ...ECONOMIC_STRUCTURE_KINDS,
  ...LATE_GAME_STRUCTURE_KINDS,
  ...CIVIC_STRUCTURE_KINDS,
  ...INFRASTRUCTURE_STRUCTURE_KINDS,
  ...INDUSTRIAL_STRUCTURE_KINDS,
  ...MANPOWER_STRUCTURE_KINDS,
  ...WORLDBREAKER_PART_STRUCTURE_KINDS,
  ...IMPERIAL_EXCHANGE_PART_STRUCTURE_KINDS,
  ...ASTRAL_DOCK_PART_STRUCTURE_KINDS,
  ...POPULATION_BUREAU_PART_STRUCTURE_KINDS
]);

// Structure kinds rendered by client-map-3d.ts through a dedicated
// hardcoded branch rather than the generic instanced-mesh overlay above
// (e.g. CARAVANARY's trade-nexus range overlay, the Umbrite rig/factory
// models). They still need to suppress the 2D canvas fallback, so this
// is the single source of truth both the 3D orchestrator's dispatch and
// the 2D renderer's suppression check should consult.
const STRUCTURE_KINDS_WITH_DEDICATED_3D_BRANCH = new Set<string>([
  "UMBRITE_RIG",
  "UMBRITE_WEAPONS_FACTORY",
  "CARAVANARY"
]);

export function isStructureHandledBy3D(kind: string): boolean {
  return (
    STRUCTURE_KINDS_WITH_DEDICATED_3D_BRANCH.has(kind) ||
    STRUCTURE_KINDS_HANDLED_BY_3D.has(kind as StructureKind)
  );
}

export type StructureOverlay = {
  readonly clear: () => void;
  readonly addInstance: (
    sceneX: number,
    sceneZ: number,
    surfaceY: number,
    kind: StructureKind,
    resource?: StructureResourceHint,
    // Set while the structure is being built or removed.
    site?: ConstructionSite
  ) => void;
  // True once a phase boundary passed that changes what addInstance would lay
  // out for a construction site added in the last rebuild.
  readonly constructionBoundaryPassed: () => boolean;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

type UniformLayoutFn = (
  sceneX: number,
  surfaceY: number,
  sceneZ: number,
  resource: StructureResourceHint
) => void;

export const mineResourceHintFor = (structureType: string, tileResource: string | undefined): StructureResourceHint =>
  structureType === "MINE" && (tileResource === "TITANIUM" || tileResource === "GEMS") ? tileResource : undefined;

const heightKey = (kind: StructureKind, hint: StructureResourceHint): string => (hint ? `${kind}:${hint}` : kind);
// Used only if a kind somehow has no measured height (every layout is measured at creation).
const FALLBACK_STRUCTURE_HEIGHT = 0.5;

// `contactShadows` is a shared overlay owned by the caller (client-map-3d.ts)
// and passed in rather than created here, so structures, towns, watchtowers,
// resources, and deposits all decal into the same InstancedMesh instead of
// each overlay module preallocating its own MAX_VISIBLE_TILES buffer. See the
// comment in client-map-3d-contact-shadow.ts for why that sharing matters.
export const createStructureOverlay = (
  scene: Scene,
  maxTiles: number,
  contactShadows: ContactShadowOverlay,
  // See client-map-3d-atmosphere.ts's AtmosphereResources doc comment --
  // given directly to each structure material's own envMap, not to
  // scene.environment.
  buildingEnvironmentTexture?: Texture
): StructureOverlay => {
  const { builder, clear: clearBuilder, commit: commitBuilder, dispose: disposeBuilder } =
    createStructurePieceBuilder(scene, maxTiles, buildingEnvironmentTexture);

  // Economic registers first so its `shared` assets (forge palette +
  // blue crystal) are available to industrial (FOUNDRY/ADV_TITANIUM_WORKS
  // reuse the forge palette; the crystal synthesizers reuse the blue
  // crystal material).
  const economic = registerEconomicStructures(builder);
  const lateGame = registerLateGameStructures(builder);
  const civic = registerCivicStructures(builder);
  const infrastructure = registerInfrastructureStructures(builder);
  const industrial = registerIndustrialStructures(builder, economic.shared);
  const manpower = registerManpowerStructures(builder);
  const worldbreakerPart = registerWorldbreakerPartStructures(builder);
  const imperialExchangePart = registerImperialExchangePartStructures(builder);
  const astralDockPart = registerAstralDockPartStructures(builder);
  const populationBureauPart = registerPopulationBureauPartStructures(builder);

  // Build a uniform dispatch table. Only the economic family uses
  // `resource`; we ignore it for the others by wrapping their layouts.
  const ignoreResource = (fn: (sx: number, sy: number, sz: number) => void): UniformLayoutFn =>
    (sx, sy, sz) => fn(sx, sy, sz);

  const layouts: Partial<Record<StructureKind, UniformLayoutFn>> = {};
  for (const [k, fn] of Object.entries(economic.layouts)) {
    layouts[k as EconomicStructureKind] = fn;
  }
  for (const [k, fn] of Object.entries(lateGame.layouts)) {
    layouts[k as LateGameStructureKind] = ignoreResource(fn);
  }
  for (const [k, fn] of Object.entries(civic.layouts)) {
    layouts[k as CivicStructureKind] = ignoreResource(fn);
  }
  for (const [k, fn] of Object.entries(infrastructure.layouts)) {
    layouts[k as InfrastructureStructureKind] = ignoreResource(fn);
  }
  for (const [k, fn] of Object.entries(industrial.layouts)) {
    layouts[k as IndustrialStructureKind] = ignoreResource(fn);
  }
  for (const [k, fn] of Object.entries(manpower.layouts)) {
    layouts[k as ManpowerStructureKind] = ignoreResource(fn);
  }
  for (const [k, fn] of Object.entries(worldbreakerPart.layouts)) {
    layouts[k as WorldbreakerPartStructureKind] = ignoreResource(fn);
  }
  for (const [k, fn] of Object.entries(imperialExchangePart.layouts)) {
    layouts[k as ImperialExchangePartStructureKind] = ignoreResource(fn);
  }
  for (const [k, fn] of Object.entries(astralDockPart.layouts)) {
    layouts[k as AstralDockPartStructureKind] = ignoreResource(fn);
  }
  for (const [k, fn] of Object.entries(populationBureauPart.layouts)) {
    layouts[k as PopulationBureauPartStructureKind] = ignoreResource(fn);
  }
  // Manifest tree naming/lore pass (docs/manifest-tree-mapping-plan.md):
  // ASSEMBLY_WORKS ("Reserve Lattice") and RAIL_DEPOT ("Neural Works") swap
  // 3D art -- they live in different families (manpower/infrastructure), so
  // this is done post-merge rather than inside either family file. No new
  // 3D assets this pass, per user decision.
  const assemblyWorksLayout = layouts.ASSEMBLY_WORKS as UniformLayoutFn;
  const railDepotLayout = layouts.RAIL_DEPOT as UniformLayoutFn;
  layouts.ASSEMBLY_WORKS = railDepotLayout;
  layouts.RAIL_DEPOT = assemblyWorksLayout;

  // Construction pipeline. Each kind's finished height is measured once, up
  // front, by dry-running its layout (nothing is placed); the dry runs may
  // leave family-local animation records behind, so they are cleared after.
  const scaffold = registerConstructionScaffold(builder, MAX_CONSTRUCTION_SITES);
  const crew = createConstructionCrewLayer(scene);
  const pods = createConstructionPodFxLayer(scene);
  // Build phase each in-flight site had at the previous / current rebuild, to
  // spot a genuine phase change (a site scrolling into view, or a reconnect,
  // has no previous entry and so never fires a pod). Both hold only the sites
  // laid out in a single rebuild, so they are bounded by the visible window.
  let phasesLastRebuild = new Map<string, number>();
  let phasesThisRebuild = new Map<string, number>();
  const structureHeights = new Map<string, number>();
  for (const [kind, layout] of Object.entries(layouts) as Array<[StructureKind, UniformLayoutFn]>) {
    const hints: StructureResourceHint[] = kind === "MINE" ? [undefined, "TITANIUM", "GEMS"] : [undefined];
    for (const hint of hints) structureHeights.set(heightKey(kind, hint), builder.measure(() => layout(0, 0, 0, hint)));
  }
  economic.clear();
  let earliestPhaseAtMs = Infinity;

  const addInstance = (
    sceneX: number,
    sceneZ: number,
    surfaceY: number,
    kind: StructureKind,
    resource: StructureResourceHint = undefined,
    site: ConstructionSite | undefined = undefined
  ): void => {
    const layout = layouts[kind];
    if (!layout) return;
    if (site) {
      const height = structureHeights.get(heightKey(kind, resource)) ?? FALLBACK_STRUCTURE_HEIGHT;
      builder.setGate((height * site.visibleBands) / CONSTRUCTION_PHASES);
      layout(sceneX, surfaceY, sceneZ, resource);
      builder.setGate(undefined);
      scaffold.place(sceneX, surfaceY, sceneZ, height, site.visibleBands, CONSTRUCTION_PHASES);
      crew.add(sceneX, sceneZ, surfaceY, site);
      const siteKey = `${site.x},${site.y}`;
      phasesThisRebuild.set(siteKey, site.phase);
      const previousPhase = phasesLastRebuild.get(siteKey);
      // A new phase brings a fresh delivery of fabricated parts (build only).
      if (site.direction === "build" && !site.stalled && previousPhase !== undefined && site.phase > previousPhase) {
        pods.spawn(sceneX + CONSTRUCTION_STACK_CENTER.x, sceneZ + CONSTRUCTION_STACK_CENTER.z, surfaceY, performance.now());
      }
      if (site.nextPhaseAtMs !== undefined) earliestPhaseAtMs = Math.min(earliestPhaseAtMs, site.nextPhaseAtMs);
    } else {
      layout(sceneX, surfaceY, sceneZ, resource);
    }
    // Only shadow kinds that actually placed geometry, so an unhandled kind
    // can't leave a blob sitting on bare ground.
    contactShadows.addShadow(sceneX, sceneZ, surfaceY, DEFAULT_CONTACT_SHADOW_RADIUS_TILES);
  };

  // Family-local animation state (e.g. mintworks flywheel records) resets
  // alongside the shared piece buffers, and update() drives them per frame.
  // The shared contactShadows overlay is cleared/committed/disposed by its
  // owner (client-map-3d.ts), once, after every caller has had a turn — not
  // here, since this module doesn't own it.
  const clear = (): void => {
    economic.clear();
    clearBuilder();
    crew.clear();
    // Pods already in flight are deliberately NOT cleared: a rebuild happens at
    // the very phase boundary that spawns one.
    phasesLastRebuild = phasesThisRebuild;
    phasesThisRebuild = new Map();
    earliestPhaseAtMs = Infinity;
  };

  return {
    clear,
    addInstance,
    constructionBoundaryPassed: (): boolean => Date.now() >= earliestPhaseAtMs,
    commit: commitBuilder,
    update: (nowMs: number): void => {
      economic.update(nowMs);
      crew.update(nowMs);
      pods.update(nowMs);
    },
    dispose: (): void => {
      crew.dispose();
      pods.dispose();
      disposeBuilder();
    }
  };
};
