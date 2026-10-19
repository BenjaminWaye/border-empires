import type { AfcSpecialization } from "./afc-specializations-types.js";

export const AFC_BASTION = [
  {
    "id": "afc-bastion-1",
    "tier": 1,
    "branch": "bastion",
    "name": "Fortification Patterns",
    "description": "Build Forts in half the usual time. Three eligible Forts have their Titanium-slot upkeep waived; prefabricated plans and starter stores support the works.",
    "mechanicalSummary": "+100% Fort build speed | First 3 Forts need no TITANIUM slot.",
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
    "description": "Increase the defense contribution of your Titanium and Umbrite Weapons Factories by 100%, including their Arsenal concentration bonus. AFC production orders prioritize protective equipment.",
    "mechanicalSummary": "+100% defense bonus from Weapons Factories.",
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
    "description": "Your garrisoned towns gain extra defense while their Fort is active. Trained reserves and protected supplies reinforce the town; other tiles gain no bonus.",
    "mechanicalSummary": "+25% defense on garrisoned towns with active Forts.",
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
    "description": "Enemies must commit 100% more manpower to assault your active Forts. Layered obstacles raise the entry requirement; this does not separately increase casualties.",
    "mechanicalSummary": "+100% manpower required to attack your active Forts.",
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
    "description": "A powered Fort stops one attack that would otherwise capture it. The attacker still spends its full commitment. The ward recharges 24 hours after use; rebuilding or transferring the Fort does not reset that timer.",
    "mechanicalSummary": "Block 1 successful enemy attack per Fort | 24h recharge.",
    "category": "ongoing",
    "requiresTechId": "",
    "effects": {
      "fortWardRechargeMs": 86400000
    }
  }
] as const satisfies readonly AfcSpecialization[];
