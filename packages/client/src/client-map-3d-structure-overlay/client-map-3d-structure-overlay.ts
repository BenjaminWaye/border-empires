import type { Scene } from "three";
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

// 3D economic-structure overlay. The per-family files (economic,
// late-game, civic, infrastructure, industrial) each own their
// materials/geometries/layouts and register slots with a shared
// piece-builder. This file just composes them, dispatches addInstance
// by kind, and exposes the StructureOverlay surface to the
// orchestrator in client-map-3d.ts.
//
// Status states (active / under_construction / inactive / removing) are
// not yet differentiated in 3D; for now every state renders fully — we
// can iterate later by adding per-instance alpha or pulse on smoke.
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
    resource?: StructureResourceHint
  ) => void;
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

// `contactShadows` is a shared overlay owned by the caller (client-map-3d.ts)
// and passed in rather than created here, so structures, towns, watchtowers,
// resources, and deposits all decal into the same InstancedMesh instead of
// each overlay module preallocating its own MAX_VISIBLE_TILES buffer. See the
// comment in client-map-3d-contact-shadow.ts for why that sharing matters.
export const createStructureOverlay = (
  scene: Scene,
  maxTiles: number,
  contactShadows: ContactShadowOverlay
): StructureOverlay => {
  const { builder, clear: clearBuilder, commit: commitBuilder, dispose: disposeBuilder } =
    createStructurePieceBuilder(scene, maxTiles);

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

  const addInstance = (
    sceneX: number,
    sceneZ: number,
    surfaceY: number,
    kind: StructureKind,
    resource: StructureResourceHint = undefined
  ): void => {
    const layout = layouts[kind];
    if (!layout) return;
    layout(sceneX, surfaceY, sceneZ, resource);
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
  };

  return {
    clear,
    addInstance,
    commit: commitBuilder,
    update: (nowMs: number): void => economic.update(nowMs),
    dispose: disposeBuilder
  };
};
