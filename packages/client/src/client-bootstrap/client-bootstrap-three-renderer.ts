import { createClientThreeTerrainRenderer, type ClientThreeTerrainRendererDeps } from "../client-map-3d/client-map-3d.js";
import { createThreeRendererHost, type ThreeRendererHost } from "../client-three-renderer-host/client-three-renderer-host.js";
import { createMapPrep } from "../client-map-prep/client-map-prep.js";
import { yieldToPaint } from "../client-init-transfer/client-init-transfer-yield.js";
import { webGLProbe } from "../client-webgl-probe/client-webgl-probe.js";
import type { ClientState } from "../client-state/client-state.js";

type ThreeTerrainRenderer = Awaited<ReturnType<typeof createClientThreeTerrainRenderer>>;

export type BootstrapThreeRendererDeps = {
  readonly enabled: boolean;
  readonly state: ClientState;
  readonly resizeTwoDimensionalCanvas: () => void;
  /** Re-renders the login overlay (map-prep stages are shown there). */
  readonly syncAuthOverlay: () => void;
  /** Read lazily at build time: some deps (the action flow) are wired after the host. */
  readonly rendererDeps: () => Omit<ClientThreeTerrainRendererDeps, "onContextLost" | "onStage">;
};

/**
 * The session's 3D renderer host, extracted from client-bootstrap.ts. The
 * renderer is built in announced stages after login (client-map-prep.ts), and
 * the WebGL support probe — a throwaway GL context — runs while the login
 * screen is idle instead of inside the post-login build.
 */
export const createBootstrapThreeRendererHost = (deps: BootstrapThreeRendererDeps): ThreeRendererHost<ThreeTerrainRenderer> => {
  const mapPrep = createMapPrep({ state: deps.state, render: deps.syncAuthOverlay });
  if (deps.enabled) scheduleEarlyWebGLProbe();
  return createThreeRendererHost<ThreeTerrainRenderer>({
    enabled: deps.enabled,
    isReady: () => deps.state.authSessionReady,
    resizeTwoDimensionalCanvas: deps.resizeTwoDimensionalCanvas,
    create: (onContextLost) => createClientThreeTerrainRenderer({ ...deps.rendererDeps(), onContextLost, onStage: mapPrep.onStage }),
    // The first frame is scheduled before the build resolves; keep the
    // "Drawing your map" step up until it has actually been painted.
    onSettled: () => yieldToPaint(mapPrep.finish)
  });
};

const scheduleEarlyWebGLProbe = (): void => {
  const run = (): void => {
    const startedAt = performance.now();
    const probe = webGLProbe();
    console.info("[renderer-3d-early-probe]", { ok: probe.ok, ms: Math.round(performance.now() - startedAt) });
  };
  const idle = (globalThis as { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number }).requestIdleCallback;
  if (typeof idle === "function") idle(run, { timeout: 1_000 });
  else setTimeout(run, 500);
};
