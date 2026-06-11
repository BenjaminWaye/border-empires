import type { Scene } from "three";
import { createStructurePieceBuilder } from "../client-map-3d-structure-builder.js";
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
  | IndustrialStructureKind;

export type { StructureResourceHint } from "../client-map-3d-structure-economic.js";

export const STRUCTURE_KINDS_HANDLED_BY_3D: ReadonlySet<StructureKind> = new Set<StructureKind>([
  ...ECONOMIC_STRUCTURE_KINDS,
  ...LATE_GAME_STRUCTURE_KINDS,
  ...CIVIC_STRUCTURE_KINDS,
  ...INFRASTRUCTURE_STRUCTURE_KINDS,
  ...INDUSTRIAL_STRUCTURE_KINDS
]);

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
  readonly dispose: () => void;
};

type UniformLayoutFn = (
  sceneX: number,
  surfaceY: number,
  sceneZ: number,
  resource: StructureResourceHint
) => void;

export const createStructureOverlay = (scene: Scene, maxTiles: number): StructureOverlay => {
  const { builder, clear, commit, dispose } = createStructurePieceBuilder(scene, maxTiles);

  // Economic registers first so its `shared` assets (forge palette +
  // blue crystal) are available to industrial (FOUNDRY/ADV_IRONWORKS
  // reuse the forge palette; the crystal synthesizers reuse the blue
  // crystal material).
  const economic = registerEconomicStructures(builder);
  const lateGame = registerLateGameStructures(builder);
  const civic = registerCivicStructures(builder);
  const infrastructure = registerInfrastructureStructures(builder);
  const industrial = registerIndustrialStructures(builder, economic.shared);

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

  const addInstance = (
    sceneX: number,
    sceneZ: number,
    surfaceY: number,
    kind: StructureKind,
    resource: StructureResourceHint = undefined
  ): void => {
    layouts[kind]?.(sceneX, surfaceY, sceneZ, resource);
  };

  return { clear, addInstance, commit, dispose };
};
