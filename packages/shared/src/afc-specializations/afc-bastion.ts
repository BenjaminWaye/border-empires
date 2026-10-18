import type { AfcSpecialization } from "./afc-specializations-types.js";

export const AFC_BASTION = [
  {
    "id": "afc-bastion-1",
    "tier": 1,
    "branch": "bastion",
    "name": "Fortification Patterns",
    "description": "Standardized prefabricated plans and dedicated starter stores make the first defensive works inexpensive to sustain and quick to assemble.",
    "mechanicalSummary": "Forts build twice as fast. Your first three qualifying forts require no Titanium slots.",
    "category": "ongoing",
    "requiresTechId": "",
    "effects": {
      "fortBuildSpeedMult": 2,
      "fortTitaniumSlotWaiverCount": 3
    }
  },
  {
    "id": "afc-bastion-2",
    "tier": 2,
    "branch": "bastion",
    "name": "Armour Production Mandate",
    "description": "The headquarters optimizes military production for protective equipment and defensive formations.",
    "mechanicalSummary": "Double the defense bonus from Titanium and Umbrite Weapons Factories, including Arsenal concentration bonuses.",
    "category": "ongoing",
    "requiresTechId": "",
    "effects": {
      "factoryDefenseContributionMult": 2
    }
  },
  {
    "id": "afc-bastion-3",
    "tier": 3,
    "branch": "bastion",
    "name": "Citadel Reserves",
    "description": "Fortified towns maintain trained local reserves and protected supply stores that reinforce their garrisons.",
    "mechanicalSummary": "+25% defense on your garrisoned towns with active forts.",
    "category": "ongoing",
    "requiresTechId": "",
    "effects": {
      "fortifiedTownDefenseMult": 1.25
    }
  },
  {
    "id": "afc-bastion-4",
    "tier": 4,
    "branch": "bastion",
    "name": "Defensive Depth",
    "description": "Layered obstacles and compartmentalized approaches require a larger assault force to mount a viable attack.",
    "mechanicalSummary": "Enemies must commit twice as much manpower to attack your active forts.",
    "category": "ongoing",
    "requiresTechId": "",
    "effects": {
      "fortAttackerCommitmentMult": 2
    }
  },
  {
    "id": "afc-bastion-5",
    "tier": 5,
    "branch": "bastion",
    "name": "Ablative Ward Network",
    "description": "A sacrificial aether ward absorbs one breach, then the local installation regenerates its reserve.",
    "mechanicalSummary": "Each powered fort blocks its first successful breach. The attacker spends the full commitment. Its ward recharges 24 hours after use, even if the fort changes hands or is rebuilt.",
    "category": "ongoing",
    "requiresTechId": "",
    "effects": {
      "fortWardRechargeMs": 86400000
    }
  }
] as const satisfies readonly AfcSpecialization[];
