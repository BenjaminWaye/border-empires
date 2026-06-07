import type { CrystalAbilityInfoKey } from "./client-crystal-ability-info.js";
import type { CrystalFamilyRegister } from "./client-map-3d-crystal-ability-overlay.js";

export const DEFENSIVE_ABILITY_KEYS: readonly CrystalAbilityInfoKey[] = ["aether_wall", "aegis_lock", "city_overclock", "create_mountain", "remove_mountain"];

export const registerDefensiveAbilities = (register: CrystalFamilyRegister): void => {
  register("aether_wall", [{ shape: "pillar", color: "#53d6ff", y: 0.24, sx: 0.26, sy: 0.48, sz: 0.08 }]);
  register("aegis_lock", [
    { shape: "ring", color: "#6fdcff", y: 0.16, sx: 0.42, sy: 0.42, sz: 0.42 },
    { shape: "pillar", color: "#6fdcff", y: 0.32, sx: 0.08, sy: 0.34, sz: 0.08 }
  ]);
  register("city_overclock", [
    { shape: "pillar", color: "#77dcff", y: 0.22, sx: 0.24, sy: 0.34, sz: 0.24 },
    { shape: "ring", color: "#77dcff", y: 0.08, sx: 0.4, sy: 0.4, sz: 0.4 }
  ]);
  register("create_mountain", [{ shape: "spike", color: "#8de4ff", y: 0.26, sx: 0.28, sy: 0.42, sz: 0.28 }]);
  register("remove_mountain", [{ shape: "ring", color: "#a4ebff", y: 0.08, sx: 0.34, sy: 0.34, sz: 0.34 }]);
};
