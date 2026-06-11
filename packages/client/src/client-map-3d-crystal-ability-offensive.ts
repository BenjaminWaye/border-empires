import type { CrystalAbilityInfoKey } from "./client-crystal-ability-info/client-crystal-ability-info.js";
import type { CrystalFamilyRegister } from "./client-map-3d-crystal-ability-overlay.js";

export const OFFENSIVE_ABILITY_KEYS: readonly CrystalAbilityInfoKey[] = ["siphon", "aether_emp", "stormfront", "aether_lance", "retort_recasting"];

export const registerOffensiveAbilities = (register: CrystalFamilyRegister): void => {
  register("siphon", [
    { shape: "ring", color: "#62d4ff", y: 0.16, sx: 0.44, sy: 0.44, sz: 0.44 },
    { shape: "spike", color: "#62d4ff", y: 0.34, sx: 0.2, sy: 0.32, sz: 0.2 }
  ]);
  register("aether_emp", [
    { shape: "ring", color: "#8be0ff", y: 0.12, sx: 0.48, sy: 0.48, sz: 0.48 },
    { shape: "crystal", color: "#8be0ff", y: 0.28, sx: 0.16, sy: 0.28, sz: 0.16 }
  ]);
  register("stormfront", [
    { shape: "ring", color: "#4ac8ff", y: 0.1, sx: 0.54, sy: 0.54, sz: 0.54 },
    { shape: "crystal", color: "#4ac8ff", y: 0.3, sx: 0.14, sy: 0.26, sz: 0.14 }
  ]);
  register("aether_lance", [
    { shape: "spike", color: "#9ce5ff", y: 0.3, sx: 0.2, sy: 0.48, sz: 0.2 },
    { shape: "ring", color: "#9ce5ff", y: 0.08, sx: 0.22, sy: 0.22, sz: 0.22 }
  ]);
  register("retort_recasting", [
    { shape: "crystal", color: "#79d8ff", y: 0.2, sx: 0.18, sy: 0.24, sz: 0.18 },
    { shape: "ring", color: "#79d8ff", y: 0.08, sx: 0.32, sy: 0.32, sz: 0.32 }
  ]);
};
