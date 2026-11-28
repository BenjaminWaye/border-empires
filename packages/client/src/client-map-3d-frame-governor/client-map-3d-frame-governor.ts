// Live back-off for a 3D renderer the GPU can't keep up with.
//
// Bug report bc313812 (Xiaomi 17 Pro, Adreno 840, devicePixelRatio 3.25): the
// main thread sat in back-to-back ~310 ms long tasks for minutes at a time —
// one per 3D frame — while the JS side of each frame (framePhases,
// terrainRebuild) cost a millisecond or two. That is the shape of the 3D loop
// blocking on the GPU: every WebGL call queues work, and once the GPU is a few
// frames behind, the next frame's calls wait for it. Everything else on the
// main thread (taps, socket messages, HUD timers) waits too, which is the lag
// the player felt.
//
// Nothing reacted to it. The quality ladder (client-map-3d-quality-tier.ts)
// only steps down after the tab *dies*, and this session never died — it just
// ran at ~3 fps at full quality: 2x drawing buffer, 4x MSAA and a 2048² shadow
// pass every frame. The only remaining lever was the "switch to 2D" prompt,
// which gives up 3D entirely.
//
// So the renderer watches its own frame cadence. When frames are sustained
// slow (outside the load / foreground warm-up that the fps monitor already
// excludes), it drops the two costs that can change without rebuilding the
// renderer: the drawing buffer goes to 1x and the shadow pass is turned off.
// The decision is remembered, so the next load also starts without MSAA
// (which can only be chosen when the WebGL context is created). If 3D is still
// slow after that, the existing 2D prompt remains the last resort.

import type { Camera, Object3D, Scene, WebGLRenderer } from "three";
import { recordClientDebugEvent } from "../client-debug/client-debug.js";
import { isLowFpsWarmupHeld } from "../client-fps-monitor/client-fps-monitor.js";
import { renderSkippingEmptyInstances } from "../client-map-3d/client-map-3d-compile-shaders.js";

/** A frame at or above this gap is under 10 fps — far below any acceptable 3D frame rate. */
export const SLOW_FRAME_MS = 100;
/** How much recent frame history the decision looks at. */
export const SLOW_FRAME_WINDOW_MS = 4_000;
/** The window must hold at least this much frame history before it can decide. */
const MIN_COVERED_MS = 3_000;
/** Fewest frame gaps worth deciding on. Kept low on purpose: a device at ~1 fps fits
 * only ~4 gaps in the window and is exactly the one that most needs the back-off. */
const MIN_FRAMES = 4;
/** Share of slow frames that marks the device as GPU-bound, not just hitching. */
const SLOW_SHARE = 0.75;
/** Gaps this long are the tab being backgrounded or paused, not a slow frame. */
const MAX_FRAME_GAP_MS = 1_500;

export const SLOW_GPU_STORAGE_KEY = "border-empires:3d-slow-gpu-at";
/** Give the device a fresh chance after a week (a driver or browser update may have fixed it). */
export const SLOW_GPU_MEMORY_MS = 7 * 24 * 60 * 60 * 1000;
/** The pixel ratio a demoted device renders at. */
export const DEMOTED_PIXEL_RATIO = 1;

export type SlowFrameDetector = {
  /** Records a rendered frame; true once frames have been sustained slow. */
  readonly record: (nowMs: number, held: boolean) => boolean;
  readonly reset: () => void;
};

export const createSlowFrameDetector = (): SlowFrameDetector => {
  const frames: number[] = [];
  const reset = (): void => {
    frames.length = 0;
  };
  const record = (nowMs: number, held: boolean): boolean => {
    const last = frames[frames.length - 1];
    if (held || (last !== undefined && nowMs - last > MAX_FRAME_GAP_MS)) reset();
    frames.push(nowMs);
    if (held) return false;
    while (frames.length > 0 && nowMs - frames[0]! > SLOW_FRAME_WINDOW_MS) frames.shift();
    const intervals = frames.length - 1;
    if (intervals < MIN_FRAMES || nowMs - frames[0]! < MIN_COVERED_MS) return false;
    let slow = 0;
    for (let i = 1; i < frames.length; i += 1) if (frames[i]! - frames[i - 1]! >= SLOW_FRAME_MS) slow += 1;
    return slow / intervals >= SLOW_SHARE;
  };
  return { record, reset };
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const safeStorage = (): StorageLike | undefined => {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
};

/** True when this device was demoted for slow 3D frames within the last week. */
export const rememberedSlowGpu = (nowMs: number, storage: StorageLike | undefined = safeStorage()): boolean => {
  try {
    const at = Number(storage?.getItem(SLOW_GPU_STORAGE_KEY));
    return Number.isFinite(at) && at > 0 && nowMs - at < SLOW_GPU_MEMORY_MS;
  } catch {
    return false;
  }
};

const rememberSlowGpu = (nowMs: number, storage: StorageLike | undefined): void => {
  try {
    storage?.setItem(SLOW_GPU_STORAGE_KEY, String(nowMs));
  } catch {
    // Private mode or a full quota: the live demotion still applies to this session.
  }
};

type GovernedRenderer = Pick<WebGLRenderer, "render" | "setPixelRatio" | "getPixelRatio"> & {
  readonly shadowMap: { enabled: boolean };
};

/** Turns the shadow pass off. Clearing castShadow also changes the lights' state
 * version, which is what makes three.js recompile materials without shadow sampling. */
const disableShadows = (renderer: GovernedRenderer, scene: Scene): void => {
  renderer.shadowMap.enabled = false;
  scene.traverse((object: Object3D) => {
    if ((object as Object3D & { isLight?: boolean }).isLight && object.castShadow) object.castShadow = false;
  });
};

export type FrameGovernor = {
  /** Renders one frame (see renderSkippingEmptyInstances) and watches the cadence. */
  readonly renderFrame: (scene: Scene, camera: Camera, nowMs: number) => void;
  readonly demoted: () => boolean;
};

export type FrameGovernorDeps = {
  readonly renderer: GovernedRenderer;
  /** True when a previous session already demoted this device; renders reduced from the start. */
  readonly startDemoted: boolean;
  readonly isHeld?: (nowMs: number) => boolean;
  readonly storage?: StorageLike | undefined;
  readonly wallNow?: () => number;
  readonly render?: (renderer: Pick<WebGLRenderer, "render">, scene: Scene, camera: Camera) => void;
};

export const createFrameGovernor = (deps: FrameGovernorDeps): FrameGovernor => {
  const detector = createSlowFrameDetector();
  const isHeld = deps.isHeld ?? isLowFpsWarmupHeld;
  const render = deps.render ?? renderSkippingEmptyInstances;
  const storage = "storage" in deps ? deps.storage : safeStorage();
  let demoted = deps.startDemoted;
  let shadowsPending = deps.startDemoted;

  const demote = (scene: Scene): void => {
    demoted = true;
    const fromPixelRatio = deps.renderer.getPixelRatio();
    if (fromPixelRatio > DEMOTED_PIXEL_RATIO) deps.renderer.setPixelRatio(DEMOTED_PIXEL_RATIO);
    disableShadows(deps.renderer, scene);
    rememberSlowGpu((deps.wallNow ?? Date.now)(), storage);
    recordClientDebugEvent("warn", "renderer", "3d-slow-frames-demoted", { fromPixelRatio, toPixelRatio: deps.renderer.getPixelRatio() });
  };

  const renderFrame = (scene: Scene, camera: Camera, nowMs: number): void => {
    if (shadowsPending) {
      // Lights are created after the renderer, so a remembered demotion clears them on the first frame.
      shadowsPending = false;
      disableShadows(deps.renderer, scene);
    }
    render(deps.renderer, scene, camera);
    if (!demoted && detector.record(nowMs, isHeld(nowMs))) demote(scene);
  };

  return { renderFrame, demoted: () => demoted };
};
