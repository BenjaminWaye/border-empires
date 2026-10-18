import type { AfcSpecialization } from "./afc-specializations-types.js";

export const AFC_EXCHEQUER = [
  {
    "id": "afc-exchequer-1",
    "tier": 1,
    "branch": "exchequer",
    "name": "Founding Concession",
    "description": "Favorable starter export contracts and coordinated provisioning make the core more profitable and reduce food losses.",
    "mechanicalSummary": "Your first three towns produce ×1.5 Coin and each uses 2 fewer FOOD slots. Support buildings still need FOOD.",
    "category": "ongoing",
    "requiresTechId": "",
    "effects": {
      "firstThreeTownsGoldOutputMult": 1.5,
      "firstThreeTownsFoodSlotReduction": 2
    }
  },
  {
    "id": "afc-exchequer-2",
    "tier": 2,
    "branch": "exchequer",
    "name": "Scarcity Consignment",
    "description": "The factor buys finished extraction equipment offworld, even when the local AFC lacks the capability to manufacture more.",
    "mechanicalSummary": "Deliver finished boosters to every eligible deposit of your least-owned known resource. No building Manifest needed. If none qualify, gain 1 FOOD slot.",
    "category": "installation",
    "requiresTechId": "",
    "effects": {
      "scarcityConsignment": 1
    }
  },
  {
    "id": "afc-exchequer-3",
    "tier": 3,
    "branch": "exchequer",
    "name": "Clearing Privilege",
    "description": "Preferential clearing terms increase the extra export credit earned by an established Clearing House network.",
    "mechanicalSummary": "Double the Clearing House uplift: each connected Manufactory adds +60% town Coin production instead of +35%.",
    "category": "ongoing",
    "requiresTechId": "",
    "effects": {
      "clearingHouseUpliftMult": 2
    }
  },
  {
    "id": "afc-exchequer-4",
    "tier": 4,
    "branch": "exchequer",
    "name": "Orbital Recruitment Contract",
    "description": "The factor orders ancillary contingents from offworld suppliers; improved dispatch puts purchased and existing reserves into formations faster.",
    "mechanicalSummary": "Buy 5 manpower for 1 Coin, with no purchase limit. Pool-to-flag transfer is 50% faster. Paid recruits can exceed your normal pool cap.",
    "category": "active",
    "requiresTechId": "",
    "effects": {
      "orbitalRecruitmentMpPerCoin": 5,
      "logisticsThroughputMult": 1.5
    }
  },
  {
    "id": "afc-exchequer-5",
    "tier": 5,
    "branch": "exchequer",
    "name": "Metropolitan Concession",
    "description": "The Court recognizes preferred export centers, and the factor arranges a resettlement consignment for their continuing development.",
    "mechanicalSummary": "Double Coin output in your three core towns, stacking to ×3 with Founding Concession. Deliver +50% current population to those below Metropolis, up to their population caps.",
    "category": "installation",
    "requiresTechId": "",
    "effects": {
      "firstThreeTownsGoldOutputMult": 2,
      "corePopulationConsignmentMult": 1.5
    }
  }
] as const satisfies readonly AfcSpecialization[];
