import type { AfcSpecialization } from "./afc-specializations-types.js";

export const AFC_DOMINION = [
  {
    "id": "afc-dominion-1",
    "tier": 1,
    "branch": "dominion",
    "name": "Relay Fabrication Line",
    "description": "Relay Beacons cost one-third of the usual manpower and finish instantly, and your first ten Relays need no FOOD slot instead of five. The AFC supplies prefabricated relay assemblies to its field crews.",
    "mechanicalSummary": "Relays: −67% manpower | Instant | 10 FOOD-free instead of 5.",
    "category": "ongoing",
    "requiresTechId": "",
    "effects": {
      "relayBeaconBuildManpowerCostMult": 1 / 3,
      "relayBeaconInstantBuild": 1,
      "relayBeaconFreeFoodSlotBonus": 5
    }
  },
  {
    "id": "afc-dominion-2",
    "tier": 2,
    "branch": "dominion",
    "name": "Colonial Charter",
    "description": "Every town you garrison gets a free Incubation Engine on an open support tile — no Coin, manpower or Incubation Corps needed. It still uses its FOOD slot. Towns you already hold receive theirs when the charter is installed.",
    "mechanicalSummary": "Free Incubation Engine in every garrisoned town.",
    "category": "ongoing",
    "requiresTechId": "",
    "effects": {
      "colonialIncubationEngine": 1
    }
  },
  {
    "id": "afc-dominion-3",
    "tier": 3,
    "branch": "dominion",
    "name": "Provincial Survey Array",
    "description": "Existing and new towns administer land up to 4 tiles away instead of 3. Survey and dispatch equipment extend each town’s reach.",
    "mechanicalSummary": "Town reach: 3 → 4 tiles.",
    "category": "ongoing",
    "requiresTechId": "",
    "effects": {
      "townReachRadiusBonus": 1
    }
  },
  {
    "id": "afc-dominion-4",
    "tier": 4,
    "branch": "dominion",
    "name": "Expansion Doctrine",
    "description": "Expanding is priced as if you held half as many frontier tiles, and garrisoning costs half the usual manpower. Prepared settlement packages let crews secure new ground quickly.",
    "mechanicalSummary": "Expand priced on half your frontier | Garrison −50% manpower.",
    "category": "ongoing",
    "requiresTechId": "",
    "effects": {
      "expandFrontierCountMult": 0.5,
      "settleManpowerCostMult": 0.5
    }
  },
  {
    "id": "afc-dominion-5",
    "tier": 5,
    "branch": "dominion",
    "name": "Universal Fabrication Line",
    "description": "Buildings cost half the usual manpower and finish instantly. With Relay Fabrication Line, Relay Beacons cost one-sixth of the usual manpower. Shared assembly and dispatch systems stretch every work crew further.",
    "mechanicalSummary": "All buildings: −50% manpower | Instant construction.",
    "category": "ongoing",
    "requiresTechId": "",
    "effects": {
      "structureBuildManpowerCostMult": 0.5,
      "instantStructureBuild": 1
    }
  }
] as const satisfies readonly AfcSpecialization[];
