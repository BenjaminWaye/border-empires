import type { AfcSpecialization } from "./afc-specializations-types.js";

export const AFC_EXCHEQUER = [
  {
    "id": "afc-exchequer-1",
    "tier": 1,
    "branch": "exchequer",
    "name": "Founding Concession",
    "description": "Your first three towns become your fixed commercial core. They earn 50% more Coin and each needs 2 fewer FOOD slots. Support buildings still need FOOD; export contracts and coordinated provisioning fund the concession.",
    "mechanicalSummary": "First 3 towns: +50% Coin | −2 FOOD slots each.",
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
    "description": "On installation, deliver completed boosters to every eligible owned, garrisoned deposit of the selected resource. No building Manifest is needed, and existing buildings stay intact. If no deposits qualify, gain 1 FOOD slot instead.",
    "mechanicalSummary": "One-time boosters on your scarcest known resource’s eligible tiles.",
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
    "description": "Each connected Manufactory contributes +60% town Coin instead of the usual +35% when a Clearing House applies. Preferential clearing terms improve the network’s export credit.",
    "mechanicalSummary": "With a Clearing House: +60% town Coin per linked Manufactory.",
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
    "description": "Unlock paid recruitment with no purchase limit; recruits can exceed your manpower pool cap. Pool-to-flag transfers are 50% faster. The factor buys these ancillary contingents from offworld suppliers.",
    "mechanicalSummary": "Buy 5 manpower for 1 Coin | +50% flag reinforcement speed.",
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
    "description": "The same three core towns gain 100% more Coin, combining with Founding Concession for +200% total. On installation, those below Metropolis gain 50% of their current population, up to their caps. Court export privileges and a resettlement consignment supply the benefit.",
    "mechanicalSummary": "Core towns: +100% Coin | One-time +50% population below Metropolis.",
    "category": "installation",
    "requiresTechId": "",
    "effects": {
      "firstThreeTownsGoldOutputMult": 2,
      "corePopulationConsignmentMult": 1.5
    }
  }
] as const satisfies readonly AfcSpecialization[];
