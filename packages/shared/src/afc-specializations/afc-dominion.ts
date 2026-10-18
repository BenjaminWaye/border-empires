import type { AfcSpecialization } from "./afc-specializations-types.js";

export const AFC_DOMINION = [
  {
    "id": "afc-dominion-1",
    "tier": 1,
    "branch": "dominion",
    "name": "Relay Fabrication Line",
    "description": "The AFC mass-produces standardized relay assemblies for rapid field installation.",
    "mechanicalSummary": "Relay Beacons build three times as fast.",
    "category": "ongoing",
    "requiresTechId": "",
    "effects": {
      "relayBeaconBuildSpeedMult": 3
    }
  },
  {
    "id": "afc-dominion-2",
    "tier": 2,
    "branch": "dominion",
    "name": "Harbor Survey Array",
    "description": "Hydrographic and coastal survey crews extend the terrain a dock's administration can reliably support.",
    "mechanicalSummary": "Dock reach increases from 1 to 2 tiles.",
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
    "description": "Town offices gain survey, dispatch, and communication systems for a wider surrounding jurisdiction.",
    "mechanicalSummary": "Town reach increases from 3 to 4 tiles.",
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
    "description": "Prepared settlement packages and coordinated crews shorten the work of establishing a garrison.",
    "mechanicalSummary": "Garrisoning takes half as long.",
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
    "description": "The expedition adopts a common assembly and dispatch system across its construction operations.",
    "mechanicalSummary": "All buildings build twice as fast. With Relay Fabrication Line, Relay Beacons build six times as fast.",
    "category": "ongoing",
    "requiresTechId": "",
    "effects": {
      "structureBuildSpeedMult": 2
    }
  }
] as const satisfies readonly AfcSpecialization[];
