// Everything the 3D renderer needs to fail *legibly* on a GPU we don't own.
//
// Two distinct failure modes, both of which used to end in a blank canvas
// with nothing but a console line nobody on a phone can read:
//
//  1. The context never gets created. three.js r163+ is WebGL2-only, so a
//     device offering only WebGL1 — or refusing a context outright, which
//     Safari does once a page holds too many — dies inside `new
//     WebGLRenderer` with a message that doesn't name the cause. Checking the
//     probe first turns that into an error string worth showing a player.
//  2. The context is created and then taken away. iOS Safari drops WebGL
//     contexts under memory pressure and on backgrounding. The default action
//     leaves the canvas permanently blank while the render loop keeps
//     spinning against a dead context.

import { ACESFilmicToneMapping, SRGBColorSpace, WebGLRenderer } from "three";
import { describeWebGLProbe, webGLProbe } from "../client-webgl-probe/client-webgl-probe.js";
import { pixelRatioFor } from "../client-map-3d-pixel-ratio/client-map-3d-pixel-ratio.js";
import { previousRendererAttempt } from "../client-renderer-crash-breadcrumb/client-renderer-crash-breadcrumb.js";

export type WebGLContextGuard = {
  /** True once the GPU has taken the context away; the renderer can't recover. */
  readonly isContextLost: () => boolean;
  readonly dispose: () => void;
};

/**
 * Throws with the probe's reason when this device can't run the 3D renderer,
 * so the caller's catch has something specific to show instead of three.js's
 * generic context-creation message.
 */
export const assertWebGLRendererSupported = (): void => {
  const probe = webGLProbe();
  if (probe.ok) return;
  throw new Error(`3d renderer unavailable: ${describeWebGLProbe(probe)}`);
};

/**
 * Subscribes to context loss on the renderer's canvas. `onContextLost` fires
 * at most once; the host is expected to tear the renderer down and fall back
 * to 2D rather than attempt a restore (every buffer is gone, and rebuilding
 * them is what caused the pressure in the first place).
 */
export const installWebGLContextGuard = (
  glCanvas: HTMLCanvasElement,
  onContextLost?: (reason: string) => void
): WebGLContextGuard => {
  let contextLost = false;

  const handleContextLost = (event: Event): void => {
    // Preventing the default is what would allow a restore. We don't attempt
    // one, but it also stops the browser tearing the canvas down before the
    // host can swap in the 2D renderer.
    event.preventDefault();
    if (contextLost) return;
    contextLost = true;
    const reason = (event as Event & { statusMessage?: string }).statusMessage;
    onContextLost?.(reason && reason.length > 0 ? reason : "webglcontextlost");
  };

  glCanvas.addEventListener("webglcontextlost", handleContextLost, false);

  return {
    isContextLost: () => contextLost,
    dispose: () => glCanvas.removeEventListener("webglcontextlost", handleContextLost, false)
  };
};

export type ThreeRenderTarget = {
  /** The WebGL canvas, inserted directly behind the 2D game canvas. */
  readonly glCanvas: HTMLCanvasElement;
  readonly renderer: WebGLRenderer;
  readonly contextGuard: WebGLContextGuard;
};

/**
 * Creates the 3D renderer's canvas and WebGL renderer, guarded on both ends:
 * unsupported devices throw before three.js is constructed, and a context lost
 * afterwards reaches `onContextLost` instead of silently blanking the map.
 *
 * Throws when the canvas has no parent to insert into, or when the device
 * can't run the renderer at all.
 */
export const createThreeRenderTarget = (
  gameCanvas: HTMLCanvasElement,
  onContextLost?: (reason: string) => void
): ThreeRenderTarget => {
  const glCanvas = document.createElement("canvas");
  glCanvas.id = "game-3d";
  gameCanvas.dataset.renderer = "3d";
  const parent = gameCanvas.parentElement;
  if (!parent) throw new Error("missing game canvas parent for 3d renderer");
  parent.insertBefore(glCanvas, gameCanvas);

  assertWebGLRendererSupported();

  const renderer = new WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  // `#game-3d` is sized entirely by CSS (`inset: 0; width/height: 100%`), and
  // client-map-3d.ts calls `setSize(w, h, false)` with the viewport's *CSS*
  // pixel size, so the ratio here scales the drawing buffer without disturbing
  // layout — which is what makes rendering above 1:1 possible at all.
  const previousAttempt = previousRendererAttempt();
  renderer.setPixelRatio(
    pixelRatioFor({
      devicePixelRatio: window.devicePixelRatio,
      previousAttemptDiedDuringAllocation:
        previousAttempt === undefined ? undefined : previousAttempt.phase === "init-started"
    })
  );

  // Filmic tone mapping gives the lit terrain/water/structure materials the
  // highlight rolloff they were tuned to expect instead of clipped, flat
  // sRGB. It applies to every material by default, though, and the map's
  // ~70 unlit MeshBasicMaterial/SpriteMaterial instances — ownership tints,
  // selection highlights, badges, targeting overlays — are chosen for
  // gameplay legibility, not lighting; those all set `toneMapped: false` at
  // their own construction site so this doesn't touch them.
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  return { glCanvas, renderer, contextGuard: installWebGLContextGuard(glCanvas, onContextLost) };
};
