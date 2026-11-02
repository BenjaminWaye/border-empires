import type { AfcSpecialization } from "./afc-specializations-types.js";

export const AFC_ORACLE = [
  {
    "id": "afc-oracle-1",
    "tier": 1,
    "branch": "oracle",
    "name": "Starter Resonance Cell",
    "description": "Waive the Crystal-slot requirement of one eligible Aether Tower. A dedicated starter resonance cell powers that installation.",
    "mechanicalSummary": "First Aether Tower needs no CRYSTAL slot.",
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
    "description": "Each Aether Tower holds twice as many shots: 6 per 24 hours instead of 3. The AFC’s resonance governor balances the tower between operations.",
    "mechanicalSummary": "×2 Aether Tower shots (6 per 24h).",
    "category": "ongoing",
    "requiresTechId": "",
    "effects": {
      "observatoryShotsMult": 2
    }
  },
  {
    "id": "afc-oracle-3",
    "tier": 3,
    "branch": "oracle",
    "name": "Long-Range Resonator",
    "description": "Cast Aether Tower abilities 15 tiles farther. The resonator extends casting range; it does not expand ordinary map vision.",
    "mechanicalSummary": "+15 tiles to Aether Tower casting range.",
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
    "description": "Cast from your tower to stop a hostile tower’s abilities, shields and flag detection for 5 minutes. This spends one of your tower’s shots, like any other tower ability. Aegis Domes still block the cast.",
    "mechanicalSummary": "Disable an enemy Aether Tower for 5 min | Uses 1 tower shot.",
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
    "description": "Active towers continuously reveal hostile flag locations and owners within casting range. You can target those signals with Purge. Enemy manpower, orders and surrounding fog stay hidden.",
    "mechanicalSummary": "Reveal enemy muster flags through fog in Aether Tower range.",
    "category": "ongoing",
    "requiresTechId": "",
    "effects": {
      "commandSignalIntercept": 1
    }
  }
] as const satisfies readonly AfcSpecialization[];
