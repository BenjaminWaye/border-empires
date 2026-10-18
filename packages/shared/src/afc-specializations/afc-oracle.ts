import type { AfcSpecialization } from "./afc-specializations-types.js";

export const AFC_ORACLE = [
  {
    "id": "afc-oracle-1",
    "tier": 1,
    "branch": "oracle",
    "name": "Starter Resonance Cell",
    "description": "A dedicated starter power cell supplies that installation's normal slot requirement.",
    "mechanicalSummary": "Your first qualifying Aether Tower needs no CRYSTAL slot.",
    "category": "ongoing",
    "requiresTechId": "",
    "effects": {
      "observatoryCrystalSlotWaiverCount": 1
    }
  },
  {
    "id": "afc-oracle-2",
    "tier": 2,
    "branch": "oracle",
    "name": "Resonance Governor",
    "description": "Automated phase balancing shortens recovery between operations.",
    "mechanicalSummary": "Aether Tower abilities recharge twice as fast.",
    "category": "ongoing",
    "requiresTechId": "",
    "effects": {
      "observatoryCooldownMult": 0.5
    }
  },
  {
    "id": "afc-oracle-3",
    "tier": 3,
    "branch": "oracle",
    "name": "Long-Range Resonator",
    "description": "A tuned resonator maintains a usable control signal over longer distances.",
    "mechanicalSummary": "Aether Tower casting range increases by 15 tiles.",
    "category": "ongoing",
    "requiresTechId": "",
    "effects": {
      "observatoryRangeBonus": 15
    }
  },
  {
    "id": "afc-oracle-4",
    "tier": 4,
    "branch": "oracle",
    "name": "Counterphase Emitter",
    "description": "The tower transmits interference matched to the hostile resonator, disrupting its ability to maintain a shield or cast.",
    "mechanicalSummary": "Suppress a hostile tower’s casting, shields and flag detection for 5 minutes. Uses your casting tower’s Purge cooldown. Aegis Domes still block suppression.",
    "category": "active",
    "requiresTechId": "",
    "effects": {
      "towerSuppressionDurationMs": 300000
    }
  },
  {
    "id": "afc-oracle-5",
    "tier": 5,
    "branch": "oracle",
    "name": "Command-Signal Intercept",
    "description": "Signal processors locate formation command traffic without decoding its full contents.",
    "mechanicalSummary": "Detect exact hostile muster flag locations and owners through fog in active tower range. Purge can target these signals. Manpower and orders remain hidden.",
    "category": "ongoing",
    "requiresTechId": "",
    "effects": {
      "commandSignalIntercept": 1
    }
  }
] as const satisfies readonly AfcSpecialization[];
