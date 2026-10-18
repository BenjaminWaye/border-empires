import type { AfcSpecialization } from "./afc-specializations-types.js";

export const AFC_VANGUARD = [
  {
    "id": "afc-vanguard-1",
    "tier": 1,
    "branch": "vanguard",
    "name": "Pacification Routines",
    "description": "Command software loads specialized assault patterns for the planet's residual defense positions.",
    "mechanicalSummary": "×2 attack against Planetary Defense and barbarian holdings.",
    "category": "ongoing",
    "requiresTechId": "",
    "effects": {
      "attackVsBarbariansMult": 2
    }
  },
  {
    "id": "afc-vanguard-2",
    "tier": 2,
    "branch": "vanguard",
    "name": "Assault Command Lattice",
    "description": "Additional command channels coordinate another formation while accelerated orders shorten the assault phase.",
    "mechanicalSummary": "+1 muster flag. Assaults resolve 10 seconds faster; travel time is unchanged.",
    "category": "ongoing",
    "requiresTechId": "",
    "effects": {
      "musterMaxTilesAdd": 1,
      "attackResolveSpeedReduceMs": 10000
    }
  },
  {
    "id": "afc-vanguard-3",
    "tier": 3,
    "branch": "vanguard",
    "name": "Battlefield Momentum",
    "description": "A formation's captured intelligence and coordinated advance produce a temporary local advantage. Frontier gains sustain initiative; defeating a garrison deepens it.",
    "mechanicalSummary": "Garrison victories give the launching flag +5% attack, up to +15%. Frontier captures refresh the timer. One stack expires per 5 idle minutes; moving or disbanding clears it.",
    "category": "ongoing",
    "requiresTechId": "",
    "effects": {
      "flagMomentumAttackPerStack": 0.05
    }
  },
  {
    "id": "afc-vanguard-4",
    "tier": 4,
    "branch": "vanguard",
    "name": "Sapper Coordination",
    "description": "Breach crews identify access routes and demolition points, reducing the force needed to assault a fortified position.",
    "mechanicalSummary": "Halve the manpower commitment required to attack a fort.",
    "category": "ongoing",
    "requiresTechId": "",
    "effects": {
      "fortAttackManpowerCostMult": 0.5
    }
  },
  {
    "id": "afc-vanguard-5",
    "tier": 5,
    "branch": "vanguard",
    "name": "Breakthrough Protocol",
    "description": "Occupation broadcasts and the collapse of local command compel a neighboring position to capitulate.",
    "mechanicalSummary": "Winning a garrisoned tile also captures one random adjacent tile of the same defender, including garrisons. Protected or contested targets are excluded. Each victory grants at most one extra tile.",
    "category": "ongoing",
    "requiresTechId": "",
    "effects": {
      "breakthroughBonusTiles": 1
    }
  }
] as const satisfies readonly AfcSpecialization[];
