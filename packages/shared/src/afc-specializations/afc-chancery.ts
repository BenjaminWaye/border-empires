import type { AfcSpecialization } from "./afc-specializations-types.js";

export const AFC_CHANCERY = [
  {
    "id": "afc-chancery-1",
    "tier": 1,
    "branch": "chancery",
    "name": "Envoy Accreditation",
    "description": "Each mutual ally adds these benefits, with no ally-count limit. Accredited envoys coordinate allied credit, ancillary contingents and reserve facilities.",
    "mechanicalSummary": "Per ally: +2 Coin/day | +0.02 manpower/min | +30 manpower cap.",
    "category": "ongoing",
    "requiresTechId": "",
    "effects": {
      "allianceGoldPerDay": 2,
      "allianceManpowerRegenPerMinute": 0.02,
      "allianceManpowerCapAdd": 30
    }
  },
  {
    "id": "afc-chancery-2",
    "tier": 2,
    "branch": "chancery",
    "name": "Reciprocal Trade Pact",
    "description": "Physical links to allied docks count for dock and Harbor Exchange income. Your allied-link bonus increases by 100%; partners gain ordinary access unless they also own this upgrade. No Coin is taken from an ally.",
    "mechanicalSummary": "Allied dock trade access | +100% income bonus from your allied links.",
    "category": "ongoing",
    "requiresTechId": "",
    "effects": {
      "alliedDockIncomeMult": 2
    }
  },
  {
    "id": "afc-chancery-3",
    "tier": 3,
    "branch": "chancery",
    "name": "Coalition Command Accord",
    "description": "The bonus applies when you and a mutual ally have each captured or lost a tile against the defender within the past 24 hours. It applies once per attack, regardless of ally count. Coalition dispatch coordinates the assault.",
    "mechanicalSummary": "+15% attack against a shared enemy | 24h war window.",
    "category": "ongoing",
    "requiresTechId": "",
    "effects": {
      "coalitionAttackMult": 1.15
    }
  },
  {
    "id": "afc-chancery-4",
    "tier": 4,
    "branch": "chancery",
    "name": "Court Armistice Mandate",
    "description": "Impose a truce that neither side can refuse or break for 12 hours. Your mandate recharges after 48 hours; attacks already in flight finish normally. The Court enforces the armistice.",
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
