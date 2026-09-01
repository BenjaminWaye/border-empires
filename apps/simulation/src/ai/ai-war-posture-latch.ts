// Pure state transition backing the WAR front posture
// (docs/ai-war-peace-balance-plan.md, Phase 3). The Map itself lives in
// runtime.ts (kept out of this module to avoid growing that file past its
// line cap) and is threaded through automation-command-planner.ts exactly
// like previousVictoryPath: read as an input, returned in the strategic
// snapshot's output, persisted by the caller.
//
// Hysteresis is deliberate and asymmetric: entering WAR needs only one
// tick's worth of a land-connected threat, but leaving it requires
// WAR_POSTURE_EXIT_CLEAR_TICKS consecutive threat-free ticks. Without this,
// the posture would flicker every time a single barbarian tile flips
// ownership — on the production numbers that motivated this plan (dozens of
// flips per day against one empire), a same-tick exit condition would never
// let WAR settle into anything coherent.
export type WarPostureLatchEntry = { active: boolean; clearTicks: number };

export const WAR_POSTURE_LATCH_DEFAULT: WarPostureLatchEntry = { active: false, clearTicks: 0 };

export const WAR_POSTURE_EXIT_CLEAR_TICKS = 5;

export const nextWarPostureLatch = (
  previous: WarPostureLatchEntry | undefined,
  threatNow: boolean
): WarPostureLatchEntry => {
  if (threatNow) return { active: true, clearTicks: 0 };
  if (!previous?.active) return WAR_POSTURE_LATCH_DEFAULT;
  const clearTicks = previous.clearTicks + 1;
  return clearTicks >= WAR_POSTURE_EXIT_CLEAR_TICKS ? WAR_POSTURE_LATCH_DEFAULT : { active: true, clearTicks };
};
