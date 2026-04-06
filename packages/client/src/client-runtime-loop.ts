import type { ClientState } from "./client-state.js";
import { drawClientRuntimeFrame } from "./client-runtime-frame.js";
import { startClientRuntimeTimers } from "./client-runtime-timers.js";
import type { RuntimeLoopState, StartClientRuntimeLoopDeps } from "./client-runtime-types.js";

export type { StartClientRuntimeLoopDeps } from "./client-runtime-types.js";

export const startClientRuntimeLoop = (state: ClientState, deps: StartClientRuntimeLoopDeps): void => {
  const runtimeState: RuntimeLoopState = {
    lastDrawAt: 0,
    roadNetwork: new Map(),
    roadNetworkBuiltAt: 0
  };
  deps.initTerrainTextures();
  drawClientRuntimeFrame(state, deps, runtimeState);
  deps.renderHud();
  startClientRuntimeTimers(state, deps);
};
