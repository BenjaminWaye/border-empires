import type { AfcSpecialization } from "./afc-specializations-types.js";

export const AFC_VANGUARD = [
  {
    "id": "afc-vanguard-1",
    "tier": 1,
    "branch": "vanguard",
    "name": "Pacification Routines",
    "description": "Your attacks are stronger against Planetary Defense, including barbarian holdings. AFC command software supplies assault plans for these positions.",
    "mechanicalSummary": "+100% attack against Planetary Defense.",
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
    "description": "Field one extra muster flag and shorten attack resolution by 5 seconds. Travel time stays the same; the AFC adds command channels for another formation.",
    "mechanicalSummary": "+1 muster flag | Attack resolution −5 sec.",
    "category": "ongoing",
    "requiresTechId": "",
    "effects": {
      "musterMaxTilesAdd": 1,
      "attackResolveSpeedReduceMs": 5000
    }
  },
  {
    "id": "afc-vanguard-3",
    "tier": 3,
    "branch": "vanguard",
    "name": "Battlefield Momentum",
    "description": "The attacking flag gains one stack per garrisoned tile won. Frontier captures refresh the timer; one stack expires every 5 minutes without a capture. Moving or disbanding the flag clears its stacks.",
    "mechanicalSummary": "Flag: +5% attack per garrison victory, up to +15%.",
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
    "description": "Commit half the usual manpower when attacking a fortified tile. Sapper crews prepare access routes and demolition points for the assault.",
    "mechanicalSummary": "−50% manpower required to attack Forts.",
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
    "description": "After a garrisoned victory, one random adjacent tile of the same defender surrenders for no extra attack. Garrisons can surrender too; protected or contested tiles cannot. The extra capture cannot trigger another.",
    "mechanicalSummary": "Win a garrisoned tile → capture 1 extra adjacent enemy tile.",
    "category": "ongoing",
    "requiresTechId": "",
    "effects": {
      "breakthroughBonusTiles": 1
    }
  }
] as const satisfies readonly AfcSpecialization[];
