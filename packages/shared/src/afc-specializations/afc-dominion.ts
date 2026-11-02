import type { AfcSpecialization } from "./afc-specializations-types.js";

export const AFC_DOMINION = [
  {
    "id": "afc-dominion-1",
    "tier": 1,
    "branch": "dominion",
    "name": "Relay Fabrication Line",
    "description": "Relay Beacons cost one-third of the usual manpower. The AFC supplies prefabricated relay assemblies to its field crews.",
    "mechanicalSummary": "-67% Relay Beacon manpower cost.",
    "category": "ongoing",
    "requiresTechId": "",
    "effects": {
      "relayBeaconBuildManpowerCostMult": 1 / 3
    }
  },
  {
    "id": "afc-dominion-2",
    "tier": 2,
    "branch": "dominion",
    "name": "Harbor Survey Array",
    "description": "Existing and new docks administer land up to 2 tiles away instead of 1. Coastal survey crews extend each dock’s reach.",
    "mechanicalSummary": "Dock reach: 1 → 2 tiles.",
    "category": "ongoing",
    "requiresTechId": "",
    "effects": {
      "dockReachRadiusBonus": 1
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
    "name": "Settlement Assembly Line",
    "description": "Finish garrisoning tiles in half the usual time. Prepared settlement packages and coordinated crews shorten the work.",
    "mechanicalSummary": "Garrisoning takes 50% less time.",
    "category": "ongoing",
    "requiresTechId": "",
    "effects": {
      "settlementSpeedMult": 2
    }
  },
  {
    "id": "afc-dominion-5",
    "tier": 5,
    "branch": "dominion",
    "name": "Universal Fabrication Line",
    "description": "Buildings cost half the usual manpower. With Relay Fabrication Line, Relay Beacons cost one-sixth of the usual manpower. Shared assembly and dispatch systems stretch every work crew further.",
    "mechanicalSummary": "-50% manpower cost for all buildings.",
    "category": "ongoing",
    "requiresTechId": "",
    "effects": {
      "structureBuildManpowerCostMult": 0.5
    }
  }
] as const satisfies readonly AfcSpecialization[];
