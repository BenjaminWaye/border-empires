// Picks *how expensive* a 3D attempt is allowed to be, from what the crash
// breadcrumb says the last attempts did.
//
// Before this module the renderer had exactly two states: full quality, or no
// 3D at all. The only de-escalation anywhere was in
// client-map-3d-pixel-ratio.ts, and it fired on one narrow signal — the
// previous attempt's phase still reading "init-started", the tab-died-during-
// allocation shape. Every other death got the *identical* configuration on the
// next load, twice, and then the crash-loop brake in
// client-three-renderer-host.ts parked the device in 2D permanently.
//
// That is the exact trace an iPhone reports (breadcrumb: phase
// "init-completed", failedAttempts 2, tileBudget 6000, devicePixelRatio 3):
// allocation succeeded, the tab died anyway before the 8s survival timer, and
// because the death was not "init-started" nothing was ever made cheaper. The
// device never got a chance to run 3D at a size it could afford — it went
// full-quality, full-quality, 2D forever.
//
// So the brake gets a ladder in front of it. Each consecutive failure drops to
// a materially cheaper configuration before the next attempt, and only a
// device that fails at the *bottom* of the ladder falls back to 2D:
//
//   tier 0  full quality      — pixel ratio up to 2, MSAA on, budget floored
//   tier 1  reduced           — pixel ratio up to 1.5, MSAA off
//   tier 2  minimum           — pixel ratio 1, MSAA off, budget sized to the
//                               screen with no floor
//
// The two levers are chosen because they are the two allocations that actually
// dominate on a phone, and they are independent:
//
//   * The drawing buffer scales with the square of the pixel ratio, and
//     `antialias: true` multiplies it again by the sample count (4x on iOS) for
//     *both* the color and depth attachments, plus a resolve target. At dPR 2
//     on a 390x699 viewport that is ~40MB of framebuffer before any geometry.
//     Tier 1 removes the MSAA multiplier outright and shrinks the buffer to
//     ~56%; tier 2 takes it to a quarter of tier 0.
//   * The tile budget sizes ~40 InstancedMeshes' instance matrices up front
//     (see client-map-3d-tile-budget.ts). MIN_TILE_BUDGET exists as a safety
//     margin, but on a 390x844 phone at MIN_ZOOM the screen genuinely needs
//     ~3.6k tiles and the floor hands it 6000 — 68% more memory than the
//     device can ever display. Tier 2 drops the floor and sizes to the real
//     screen, which is safe precisely because that is what the renderer's own
//     visible-window math asks for.
//
// Two breadcrumb signals feed the ladder, not one:
//
//   1. `failedAttempts` — consecutive attempts that never reached "survived".
//      This is the startup-death ladder, and it is what the iPhone trace above
//      needed.
//   2. `previousSessionEndedUncleanly` — a heartbeat on disk with no matching
//      `pagehide`, i.e. a session that ran fine for a while and was then
//      jetsam-killed. This existed already but drove *nothing*; it was written
//      to the diagnostics bundle and otherwise ignored. It is the actual iOS
//      memory-pressure shape (memory builds up over minutes of play, the tab
//      is killed long after the 8s survival timer already reset
//      `failedAttempts` to 0), so on its own it would leave the device looping
//      at full quality forever, de-escalating never. Treating it as at least
//      one rung down is what makes a mid-session kill teach the next load
//      anything.

import { MIN_TILE_BUDGET } from "../client-map-3d-tile-budget/client-map-3d-tile-budget.js";
import { MAX_PIXEL_RATIO } from "../client-map-3d-pixel-ratio/client-map-3d-pixel-ratio.js";
import type { RendererBreadcrumb } from "../client-renderer-crash-breadcrumb/client-renderer-crash-breadcrumb.js";

export type RendererQualityTier = 0 | 1 | 2;

/** The lowest rung; a failure here is what actually retires 3D for the device. */
export const MIN_QUALITY_TIER: RendererQualityTier = 2;

export type RendererQualitySettings = {
  readonly tier: RendererQualityTier;
  /** Upper bound handed to `pixelRatioFor`; the device ratio still wins if lower. */
  readonly maxPixelRatio: number;
  /** `antialias` for the WebGLRenderer. Off below tier 0 — MSAA is a multiplier
   * on the whole drawing buffer, so it is the cheapest thing to give up first. */
  readonly antialias: boolean;
  /** Floor for `resolveTileBudget`. 0 means "size to the screen, no floor". */
  readonly tileBudgetFloor: number;
};

const SETTINGS_BY_TIER: Record<RendererQualityTier, Omit<RendererQualitySettings, "tier">> = {
  0: { maxPixelRatio: MAX_PIXEL_RATIO, antialias: true, tileBudgetFloor: MIN_TILE_BUDGET },
  1: { maxPixelRatio: 1.5, antialias: false, tileBudgetFloor: MIN_TILE_BUDGET },
  2: { maxPixelRatio: 1, antialias: false, tileBudgetFloor: 0 }
};

const clampTier = (value: number): RendererQualityTier =>
  value <= 0 ? 0 : value >= MIN_QUALITY_TIER ? MIN_QUALITY_TIER : 1;

export type QualityTierInput = {
  readonly previousAttempt: RendererBreadcrumb | undefined;
  /** See `previousSessionEndedUncleanly` in the crash-breadcrumb module. */
  readonly previousSessionEndedUncleanly: boolean;
};

/**
 * The tier the next 3D attempt should run at. A device with no history, or one
 * whose last attempt survived cleanly, gets full quality.
 */
export const qualityTierFor = ({
  previousAttempt,
  previousSessionEndedUncleanly
}: QualityTierInput): RendererQualityTier => {
  if (!previousAttempt) return 0;

  // The known memory-exhaustion signature: the tab died while allocating
  // buffers, before it could even record "init-completed". Don't walk the
  // ladder for this one — go straight to the bottom, which is what the pixel
  // ratio module already did for this exact case before the ladder existed.
  if (previousAttempt.phase === "init-started") return MIN_QUALITY_TIER;

  const startupTier = previousAttempt.phase === "survived" ? 0 : clampTier(previousAttempt.failedAttempts);

  // A session killed long after it was declared healthy leaves failedAttempts
  // at 0, so the startup ladder above reads it as a perfect run. Force at
  // least one rung down so mid-session pressure de-escalates too.
  return previousSessionEndedUncleanly ? clampTier(Math.max(startupTier, 1)) : startupTier;
};

export const qualitySettingsFor = (input: QualityTierInput): RendererQualitySettings => {
  const tier = qualityTierFor(input);
  return { tier, ...SETTINGS_BY_TIER[tier] };
};
