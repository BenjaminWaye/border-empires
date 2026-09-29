import type { AbilityDefinition } from "../server-shared-types.js";
import {
  AETHER_BRIDGE_COOLDOWN_MS,
  AETHER_BRIDGE_CRYSTAL_COST,
  AETHER_BRIDGE_DURATION_MS,
  AETHER_EMP_COOLDOWN_MS,
  AETHER_EMP_CRYSTAL_COST,
  AETHER_EMP_DURATION_MS,
  AETHER_LANCE_COOLDOWN_MS,
  AETHER_LANCE_CRYSTAL_COST,
  AETHER_WALL_COOLDOWN_MS,
  AETHER_WALL_CRYSTAL_COST,
  AETHER_WALL_DURATION_MS,
  RETORT_RECAST_COOLDOWN_MS,
  RETORT_RECAST_CRYSTAL_COST,
  REVEAL_EMPIRE_ACTIVATION_COST,
  REVEAL_EMPIRE_STATS_COOLDOWN_MS,
  REVEAL_EMPIRE_STATS_CRYSTAL_COST,
  REVEAL_EMPIRE_UPKEEP_PER_MIN,
  SIPHON_COOLDOWN_MS,
  SIPHON_CRYSTAL_COST,
  SURVEY_SWEEP_COOLDOWN_MS,
  SURVEY_SWEEP_CRYSTAL_COST,
  TERRAIN_SHAPING_COOLDOWN_MS,
  TERRAIN_SHAPING_CRYSTAL_COST
} from "./server-game-constants.js";

// Split out of server-game-constants.ts (500-line source budget, see
// AGENTS.md) to make room for new abilities without growing that file
// further. Single source of truth for "which Manifest tech unlocks this
// ability" -- server handlers, shared constants and client menus all read
// this through packages/game-domain/src/ability-gating/ability-gating.ts
// (Manifest plan §7 item 2).
export const ABILITY_DEFS: Record<AbilityDefinition["id"], AbilityDefinition> = {
  reveal_empire: {
    id: "reveal_empire",
    name: "Reveal Empire",
    requiredTechIds: ["beacon-towers"],
    crystalCost: REVEAL_EMPIRE_ACTIVATION_COST,
    cooldownMs: 0,
    upkeepCrystalPerMinute: REVEAL_EMPIRE_UPKEEP_PER_MIN
  },
  reveal_empire_stats: {
    id: "reveal_empire_stats",
    name: "Reveal Empire Stats",
    requiredTechIds: ["beacon-towers"],
    crystalCost: REVEAL_EMPIRE_STATS_CRYSTAL_COST,
    cooldownMs: REVEAL_EMPIRE_STATS_COOLDOWN_MS
  },
  survey_sweep: {
    id: "survey_sweep",
    name: "Survey Sweep",
    requiredTechIds: ["surveying"],
    crystalCost: SURVEY_SWEEP_CRYSTAL_COST,
    cooldownMs: SURVEY_SWEEP_COOLDOWN_MS
  },
  aether_lance: {
    id: "aether_lance",
    name: "Aether Purge",
    requiredTechIds: ["crystal-lattices"],
    crystalCost: AETHER_LANCE_CRYSTAL_COST,
    cooldownMs: AETHER_LANCE_COOLDOWN_MS
  },
  aether_emp: { id: "aether_emp", name: "Aether EMP", requiredTechIds: ["cryptography"], crystalCost: AETHER_EMP_CRYSTAL_COST, cooldownMs: AETHER_EMP_COOLDOWN_MS, durationMs: AETHER_EMP_DURATION_MS },
  aether_bridge: {
    id: "aether_bridge",
    name: "Aether Bridge",
    requiredTechIds: ["navigation"],
    crystalCost: AETHER_BRIDGE_CRYSTAL_COST,
    cooldownMs: AETHER_BRIDGE_COOLDOWN_MS,
    durationMs: AETHER_BRIDGE_DURATION_MS
  },
  aether_wall: {
    id: "aether_wall",
    name: "Aether Wall",
    requiredTechIds: ["harborcraft"],
    crystalCost: AETHER_WALL_CRYSTAL_COST,
    cooldownMs: AETHER_WALL_COOLDOWN_MS,
    durationMs: AETHER_WALL_DURATION_MS
  },
  siphon: {
    id: "siphon",
    name: "Siphon",
    requiredTechIds: ["logistics"],
    crystalCost: SIPHON_CRYSTAL_COST,
    cooldownMs: SIPHON_COOLDOWN_MS
  },
  create_mountain: {
    id: "create_mountain",
    name: "Create Mountain",
    requiredTechIds: ["terrain-engineering"],
    crystalCost: TERRAIN_SHAPING_CRYSTAL_COST,
    cooldownMs: TERRAIN_SHAPING_COOLDOWN_MS
  },
  remove_mountain: {
    id: "remove_mountain",
    name: "Remove Mountain",
    requiredTechIds: ["terrain-engineering"],
    crystalCost: TERRAIN_SHAPING_CRYSTAL_COST,
    cooldownMs: TERRAIN_SHAPING_COOLDOWN_MS
  },
  retort_recast: {
    id: "retort_recast",
    name: "Retort Transmutation",
    requiredTechIds: ["matterwright-retort"],
    crystalCost: RETORT_RECAST_CRYSTAL_COST,
    cooldownMs: RETORT_RECAST_COOLDOWN_MS
  }
};
