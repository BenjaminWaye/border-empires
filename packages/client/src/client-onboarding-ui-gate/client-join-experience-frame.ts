import type { ClientState } from "../client-state/client-state.js";
import { tickAfcJoinDropForFrame } from "../client-afc-join-drop/client-afc-join-drop-frame.js";
import { tickOnboardingUiGateForFrame } from "./client-onboarding-ui-overlays.js";

/** Once-per-frame join sequence for the runtime loop: advance the AFC join drop, then show/hide the onboarding corner UI that waits on it. */
export const tickJoinExperienceForFrame = (
  state: ClientState,
  nowMs: number,
  viewport: { readonly canvasWidth: number; readonly canvasHeight: number; readonly tilePx: number },
  keyFor: (x: number, y: number) => string,
  renderHud: () => void
): void => {
  tickAfcJoinDropForFrame(state, nowMs, viewport, keyFor);
  tickOnboardingUiGateForFrame(state, renderHud);
};
