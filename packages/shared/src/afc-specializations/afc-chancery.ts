import type { AfcSpecialization } from "./afc-specializations-types.js";

export const AFC_CHANCERY = [
  {
    "id": "afc-chancery-1",
    "tier": 1,
    "branch": "chancery",
    "name": "Envoy Accreditation",
    "description": "Earn 10% more Coin for each active truce or alliance you hold, up to +50%. Court-imposed truces count too. Accredited envoys turn every standing agreement into trade credit.",
    "mechanicalSummary": "+10% Coin per active truce or alliance (max +50%).",
    "category": "ongoing",
    "requiresTechId": "",
    "effects": {
      "truceIncomeShare": 0.1
    }
  },
  {
    "id": "afc-chancery-2",
    "tier": 2,
    "branch": "chancery",
    "name": "Diplomatic Corps",
    "description": "AI empires start 15 opinion points warmer towards you, and truces you buy from them cost half as much. A permanent diplomatic staff smooths every negotiation.",
    "mechanicalSummary": "AI opinion +15 | Truces you buy −50% Coin.",
    "category": "ongoing",
    "requiresTechId": "",
    "effects": {
      "aiOpinionBonus": 15,
      "truceCostMult": 0.5
    }
  },
  {
    "id": "afc-chancery-3",
    "tier": 3,
    "branch": "chancery",
    "name": "Allied Levies",
    "description": "Each mutual ally raises your manpower capacity and regeneration by 15%, counting up to three allies. Allied Houses send ancillary contingents to serve under your command.",
    "mechanicalSummary": "+15% manpower cap and regeneration per ally (max +45%).",
    "category": "ongoing",
    "requiresTechId": "",
    "effects": {
      "alliedLevyShare": 0.15
    }
  },
  {
    "id": "afc-chancery-4",
    "tier": 4,
    "branch": "chancery",
    "name": "Court Armistice Mandate",
    "description": "Impose a truce that neither side can refuse or break for 12 hours. Your mandate recharges after 48 hours; attacks already in flight finish normally. With Envoy Accreditation the armistice also pays like any other truce.",
    "mechanicalSummary": "Force a 12h truce | 48h cooldown.",
    "category": "active",
    "requiresTechId": "",
    "effects": {
      "forcedTruceDurationMs": 43200000,
      "forcedTruceCooldownMs": 172800000
    }
  },
  {
    "id": "afc-chancery-5",
    "tier": 5,
    "branch": "chancery",
    "name": "Suzerainty Recognition",
    "description": "Your land contributes 100% more to your alliance bloc’s diplomatic victory total. Actual territory still determines the largest member and sole winner; a tie has no leader. Court recognition increases your claims’ standing.",
    "mechanicalSummary": "+100% territory weight for diplomatic victory.",
    "category": "ongoing",
    "requiresTechId": "",
    "effects": {
      "diplomaticTerritoryWeightMult": 2
    }
  }
] as const satisfies readonly AfcSpecialization[];
