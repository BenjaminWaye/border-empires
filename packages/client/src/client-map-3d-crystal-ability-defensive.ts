import type { CrystalAbilityInfoKey } from "./client-crystal-ability-info.js";
import type { AbilityPart } from "./client-map-3d-crystal-ability-offensive.js";

export const DEFENSIVE_PARTS: Partial<Record<CrystalAbilityInfoKey, ReadonlyArray<AbilityPart>>> = {
  aether_wall: [{ kind: "pillar", ox: 0, oy: 0.22, oz: 0, sx: 0.25, sy: 0.45, sz: 0.08 }],
  aegis_lock: [{ kind: "ring", ox: 0, oy: 0.14, oz: 0, sx: 0.4, sy: 0.4, sz: 0.4 }, { kind: "pillar", ox: 0, oy: 0.3, oz: 0, sx: 0.08, sy: 0.3, sz: 0.08 }],
  city_overclock: [{ kind: "pillar", ox: 0, oy: 0.22, oz: 0, sx: 0.2, sy: 0.3, sz: 0.2 }, { kind: "ring", ox: 0, oy: 0.09, oz: 0, sx: 0.38, sy: 0.38, sz: 0.38 }],
  create_mountain: [{ kind: "spike", ox: 0, oy: 0.26, oz: 0, sx: 0.28, sy: 0.42, sz: 0.28 }],
  remove_mountain: [{ kind: "ring", ox: 0, oy: 0.08, oz: 0, sx: 0.32, sy: 0.32, sz: 0.32 }]
};
