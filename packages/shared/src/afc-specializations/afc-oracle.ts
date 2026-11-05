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
    "description": "Cast from your tower to stop a hostile tower’s abilities and shield for 5 minutes. This spends one of your tower’s shots, like any other tower ability, and leaves the tower open to Resonance Hijack. Aegis Domes still block the cast.",
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
    "name": "Resonance Hijack",
    "description": "Take over a hostile Aether Tower that has no shot left or is suppressed by Counterphase. Casting spends one shot and starts a 10-minute takeover: the target cannot cast or shield, and your casting tower is revealed to its owner. If your tower is still yours and active when the timer ends, the target tower and its tile become yours. Aegis Domes block the cast; one hijack per 24 hours.",
    "mechanicalSummary": "Seize an emptied or suppressed enemy Aether Tower | 10-min takeover.",
    "category": "active",
    "requiresTechId": "",
    "effects": {
      "resonanceHijack": 1
    }
  }
] as const satisfies readonly AfcSpecialization[];
