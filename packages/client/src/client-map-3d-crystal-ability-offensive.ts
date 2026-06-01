import type { CrystalAbilityInfoKey } from "./client-crystal-ability-info.js";

export type AbilityPart = {
  readonly kind: "ring" | "pillar" | "spike" | "crystal";
  readonly ox: number;
  readonly oy: number;
  readonly oz: number;
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
  readonly ry?: number;
};

export const OFFENSIVE_PARTS: Partial<Record<CrystalAbilityInfoKey, ReadonlyArray<AbilityPart>>> = {
  siphon: [{ kind: "ring", ox: 0, oy: 0.11, oz: 0, sx: 0.4, sy: 0.4, sz: 0.4 }, { kind: "spike", ox: 0, oy: 0.28, oz: 0, sx: 0.18, sy: 0.26, sz: 0.18 }],
  aether_emp: [{ kind: "ring", ox: 0, oy: 0.1, oz: 0, sx: 0.46, sy: 0.46, sz: 0.46 }, { kind: "crystal", ox: 0, oy: 0.26, oz: 0, sx: 0.12, sy: 0.2, sz: 0.12 }],
  stormfront: [{ kind: "ring", ox: 0, oy: 0.1, oz: 0, sx: 0.5, sy: 0.5, sz: 0.5 }, { kind: "crystal", ox: 0, oy: 0.26, oz: 0, sx: 0.12, sy: 0.22, sz: 0.12 }],
  aether_lance: [{ kind: "spike", ox: 0, oy: 0.28, oz: 0, sx: 0.2, sy: 0.5, sz: 0.2 }],
  retort_recasting: [{ kind: "crystal", ox: 0, oy: 0.21, oz: 0, sx: 0.16, sy: 0.24, sz: 0.16 }, { kind: "ring", ox: 0, oy: 0.08, oz: 0, sx: 0.3, sy: 0.3, sz: 0.3 }]
};
