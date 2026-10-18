import type { AfcSpecialization } from "./afc-specializations-types.js";

export const AFC_CHANCERY = [
  {
    "id": "afc-chancery-1",
    "tier": 1,
    "branch": "chancery",
    "name": "Envoy Accreditation",
    "description": "Coalition members contribute credit, ancillary contingents, and reserve facilities to an accredited liaison headquarters.",
    "mechanicalSummary": "Each mutual ally adds +2 Coin/day, +0.02 manpower/min and +30 manpower capacity. No ally limit.",
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
    "description": "A registered joint freight undertaking receives preferential clearing rates, insurance, and export contracts.",
    "mechanicalSummary": "Physical allied dock links count toward dock and Harbor Exchange income. Your allied links earn twice the normal bonus; partners also gain access.",
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
    "description": "Liaison officers share current battlefield information and coordinate offensives against a common opponent.",
    "mechanicalSummary": "+15% attack when you and a mutual ally have each exchanged captured tiles with the defender in the past 24 hours. Applies once per attack.",
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
    "description": "The chancery invokes a campaign arbitration mandate; the Court orders both Houses to observe a binding armistice.",
    "mechanicalSummary": "Impose a binding 12-hour truce on another House. Recharges in 48 hours. Battles already in flight finish.",
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
    "description": "Court assessors give greater recognition to the accredited House's claims as guarantor of the coalition settlement.",
    "mechanicalSummary": "Your territory counts double toward your alliance bloc’s diplomatic victory. The largest member by actual territory is the sole winner; a tie has no leader.",
    "category": "ongoing",
    "requiresTechId": "",
    "effects": {
      "diplomaticTerritoryWeightMult": 2
    }
  }
] as const satisfies readonly AfcSpecialization[];
