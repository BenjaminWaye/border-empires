// Extracted from client-state.ts (which is at the 500-line file cap) purely
// to keep that file's growth budget available for new state fields — no
// behavior change. Season HUD vs. galactic Space View top-level screen swap
// (client-space-view/) plus the owns-a-galaxy-Planet eligibility flag that
// gates the Space View nav toggle.
export const createInitialSpaceViewState = () => ({
  activeScreen: "season" as "season" | "space",
  spaceViewEligible: false
});
