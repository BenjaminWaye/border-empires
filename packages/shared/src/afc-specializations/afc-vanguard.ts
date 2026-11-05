import type { AfcSpecialization } from "./afc-specializations-types.js";

export const AFC_VANGUARD = [
  {
    "id": "afc-vanguard-1",
    "tier": 1,
    "branch": "vanguard",
    "name": "Pacification Routines",
    "description": "Your attacks are twice as strong against Planetary Defense, including barbarian holdings, and each of their tiles you capture pays a 25 Coin bounty. AFC command software supplies assault plans for these positions, and the Court pays for every one cleared.",
    "mechanicalSummary": "+100% attack vs Planetary Defense | +25 Coin per tile taken.",
    "category": "ongoing",
    "requiresTechId": "",
    "effects": {
      "attackVsBarbariansMult": 2,
      "barbarianCaptureCoinBonus": 25
    }
  },
  {
    "id": "afc-vanguard-2",
    "tier": 2,
    "branch": "vanguard",
    "name": "Assault Command Lattice",
    "description": "Field one extra muster flag, and your fights resolve in 10 seconds instead of 15 — half again as many attacks per minute. Travel time stays the same; the AFC adds command channels for another formation.",
    "mechanicalSummary": "+1 muster flag | Fights resolve in 10s instead of 15s.",
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
    "description": "The attacking flag gains a stack for each garrisoned tile it wins, up to five. Frontier captures refresh the timer; one stack expires every 5 minutes without a capture. Moving or disbanding the flag clears its stacks.",
    "mechanicalSummary": "Flag: +10% attack per garrison victory, up to +50%.",
    "category": "ongoing",
    "requiresTechId": "",
    "effects": {
      "flagMomentumAttackPerStack": 0.1
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
    "description": "After a garrisoned victory, a random adjacent tile of the same defender surrenders with no extra attack — two tiles if the flag has full Battlefield Momentum. Garrisons can surrender too; protected or contested tiles cannot. Surrendered tiles cannot trigger another Breakthrough.",
    "mechanicalSummary": "Win a garrisoned tile → capture 1 extra adjacent tile (2 at full Momentum).",
    "category": "ongoing",
    "requiresTechId": "",
    "effects": {
      "breakthroughBonusTiles": 1,
      "breakthroughMaxMomentumBonusTiles": 1
    }
  }
] as const satisfies readonly AfcSpecialization[];
