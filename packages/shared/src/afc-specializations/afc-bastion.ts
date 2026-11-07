import type { AfcSpecialization } from "./afc-specializations-types.js";

export const AFC_BASTION = [
  {
    "id": "afc-bastion-1",
    "tier": 1,
    "branch": "bastion",
    "name": "Citadel Reserves",
    "description": "Your towns keep growing when fighting breaks out nearby, and garrisoned towns with an active Palisade or Fort defend 25% harder. Trained reserves and protected supply stores keep the town working and reinforce its garrison.",
    "mechanicalSummary": "Towns grow during nearby war | +25% defense on fortified towns.",
    "category": "ongoing",
    "requiresTechId": "",
    "effects": {
      "townGrowthIgnoresNearbyWar": 1,
      "fortifiedTownDefenseMult": 1.25
    }
  },
  {
    "id": "afc-bastion-2",
    "tier": 2,
    "branch": "bastion",
    "name": "Fortification Patterns",
    "description": "Build Forts without the Titanium Forge Module. Your first three Forts cost no manpower and need no Titanium slot; later Forts cost half the usual manpower. Prefabricated plans and starter stores support the works.",
    "mechanicalSummary": "Forts without the manifest | First 3 Forts free | −50% Fort manpower.",
    "category": "ongoing",
    "requiresTechId": "",
    "effects": {
      "fortTechWaiver": 1,
      "freeFortCount": 3,
      "fortTitaniumSlotWaiverCount": 3,
      "fortBuildManpowerCostMult": 0.5
    }
  },
  {
    "id": "afc-bastion-3",
    "tier": 3,
    "branch": "bastion",
    "name": "Armour Production Mandate",
    "description": "Double the defense your Titanium and Umbrite Weapons Factories contribute, including the extra bonus for owning several factories. AFC production orders prioritize protective equipment.",
    "mechanicalSummary": "+100% defense bonus from Weapons Factories.",
    "category": "ongoing",
    "requiresTechId": "",
    "effects": {
      "factoryDefenseContributionMult": 2
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
