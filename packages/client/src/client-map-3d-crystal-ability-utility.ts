import type { CrystalAbilityInfoKey } from "./client-crystal-ability-info.js";
import type { AbilityPart } from "./client-map-3d-crystal-ability-offensive.js";

export const UTILITY_PARTS: Partial<Record<CrystalAbilityInfoKey, ReadonlyArray<AbilityPart>>> = {
  reveal_empire: [{ kind: "ring", ox: 0, oy: 0.09, oz: 0, sx: 0.42, sy: 0.42, sz: 0.42 }],
  reveal_empire_stats: [{ kind: "crystal", ox: 0, oy: 0.18, oz: 0, sx: 0.2, sy: 0.2, sz: 0.2 }],
  survey_sweep: [{ kind: "ring", ox: 0, oy: 0.1, oz: 0, sx: 0.48, sy: 0.48, sz: 0.48 }, { kind: "ring", ox: 0, oy: 0.16, oz: 0, sx: 0.28, sy: 0.28, sz: 0.28 }],
  aether_bridge: [{ kind: "pillar", ox: 0, oy: 0.15, oz: 0, sx: 0.38, sy: 0.14, sz: 0.1 }],
  astral_dock_launch: [{ kind: "spike", ox: 0, oy: 0.3, oz: 0, sx: 0.2, sy: 0.5, sz: 0.2 }, { kind: "ring", ox: 0, oy: 0.09, oz: 0, sx: 0.36, sy: 0.36, sz: 0.36 }]
};
