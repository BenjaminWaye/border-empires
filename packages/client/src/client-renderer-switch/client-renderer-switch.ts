// Switching the map renderer between 3D and 2D. The renderer is chosen once at
// page load from `?renderer=` (see client-renderer-mode.ts), so a switch is a
// reload with that param rewritten. Kept separate from the HUD so the
// settings field, the renderer-prompt overlay and the 2D-mode notice all share
// one implementation and one way of clearing the crash brake.
import { prefers2DRendererMode, isTrue3DRendererActive } from "../client-renderer-mode.js";
import { clearRendererCrashStreak } from "../client-renderer-crash-breadcrumb/client-renderer-crash-breadcrumb.js";
import { rendererFailureSnapshot } from "../client-webgl-probe/client-webgl-probe.js";

export type RendererTarget = "2d" | "3d";

/**
 * - `3d`: the true-3D renderer is running, or still starting (no failure has
 *   been recorded yet — calling that "couldn't start" would be wrong).
 * - `2d-chosen`: the session asked for `?renderer=2d` (the "Switch to 2D"
 *   prompt, a shared link), so 3D was never attempted.
 * - `2d-fallback`: 3D was wanted but failed to start or lost its context.
 */
export type ActiveRendererKind = "3d" | "2d-chosen" | "2d-fallback";

export const rendererKindFor = (input: { prefers2D: boolean; true3DActive: boolean; failed: boolean }): ActiveRendererKind => {
  if (input.true3DActive) return "3d";
  if (input.prefers2D) return "2d-chosen";
  return input.failed ? "2d-fallback" : "3d";
};

export const activeRendererKind = (): ActiveRendererKind =>
  rendererKindFor({
    prefers2D: prefers2DRendererMode,
    true3DActive: isTrue3DRendererActive(),
    failed: rendererFailureSnapshot() !== undefined
  });

export const rendererSwitchUrl = (href: string, target: RendererTarget): string => {
  const url = new URL(href);
  url.searchParams.set("renderer", target);
  return url.toString();
};

/**
 * Reloads into the requested renderer. Switching *to* 3D is an explicit
 * request, so it also clears the crash-loop brake: otherwise the brake, which
 * reads its streak straight from storage, would re-trip on the reload and the
 * button would appear to do nothing. `replace` (not `assign`) so the back
 * button doesn't bounce the player between the two renderers.
 */
export const switchRenderer = (target: RendererTarget): void => {
  if (typeof window === "undefined") return;
  if (target === "3d") clearRendererCrashStreak();
  window.location.replace(rendererSwitchUrl(window.location.href, target));
};
