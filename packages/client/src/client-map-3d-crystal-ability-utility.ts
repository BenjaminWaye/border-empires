import type { CrystalAbilityInfoKey } from "./client-crystal-ability-info/client-crystal-ability-info.js";
import type { CrystalFamilyRegister } from "./client-map-3d-crystal-ability-overlay.js";

export const UTILITY_ABILITY_KEYS: readonly CrystalAbilityInfoKey[] = [
  "reveal_empire", "reveal_empire_stats", "survey_sweep", "aether_bridge", "astral_dock_launch"
];

export const registerUtilityAbilities = (register: CrystalFamilyRegister): void => {
  register("reveal_empire", [{ shape: "ring", color: "#50d2e9", y: 0.08, sx: 0.46, sy: 0.46, sz: 0.46 }]);
  register("reveal_empire_stats", [{ shape: "crystal", color: "#55d5ec", y: 0.2, sx: 0.22, sy: 0.22, sz: 0.22 }]);
  register("survey_sweep", [
    { shape: "ring", color: "#59d7ee", y: 0.1, sx: 0.5, sy: 0.5, sz: 0.5 },
    { shape: "ring", color: "#59d7ee", y: 0.16, sx: 0.28, sy: 0.28, sz: 0.28 }
  ]);
  register("aether_bridge", [{ shape: "pillar", color: "#64ddf3", y: 0.14, sx: 0.38, sy: 0.16, sz: 0.1 }]);
  register("astral_dock_launch", [
    { shape: "spike", color: "#6fe1f6", y: 0.3, sx: 0.2, sy: 0.5, sz: 0.2 },
    { shape: "ring", color: "#6fe1f6", y: 0.08, sx: 0.4, sy: 0.4, sz: 0.4 }
  ]);
};
