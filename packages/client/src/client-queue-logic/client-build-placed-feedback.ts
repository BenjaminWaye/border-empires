// Feedback for a player-pressed Place: the build either starts now or joins
// the development queue, and without this neither showed anything (playtest:
// "I press Place and get no feedback"). Deliberately not the big capture-alert
// banner (unwanted). The town screen reads buildPlacedPresses to flash the Place button
// "✓ Placed" / "✓ Queued" (client-hud-v2-build-list.ts); the feed line serves
// the legacy HUD, whose Alerts panel shows the feed. Only BUILD_STRUCTURE
// presses announce -- removals and queue drains (fromQueue) stay silent.
import type { VisibleActionWarningDeps } from "../client-visible-action-warning.js";

export type BuildPlacedOutcome = "started" | "queued";

/** How long the Place button shows its confirmation. */
export const BUILD_PLACED_FLASH_MS = 1_600;

let lastPlaced: { outcome: BuildPlacedOutcome } | undefined;
let pressCount = 0;

/**
 * How many Place presses have gone through, and the latest one's outcome. A caller compares the count
 * before and after its own press, so the confirmation belongs to that press: a press rejected locally
 * leaves the count unchanged and must not inherit an earlier press's "✓ Placed".
 */
export const buildPlacedPresses = (): { count: number; outcome: BuildPlacedOutcome | undefined } =>
  ({ count: pressCount, outcome: lastPlaced?.outcome });

export const announceBuildPlaced = (
  deps: VisibleActionWarningDeps,
  payloadType: string,
  label: string,
  outcome: BuildPlacedOutcome,
  opts: { fromQueue?: boolean; suppressWarnings?: boolean }
): void => {
  if (payloadType !== "BUILD_STRUCTURE" || opts.fromQueue || opts.suppressWarnings) return;
  lastPlaced = { outcome };
  pressCount += 1;
  const title = outcome === "started" ? "Building placed" : "Build queued";
  const detail = outcome === "started" ? `${label} — construction started.` : `${label} — starts when a development slot frees up.`;
  deps.pushFeed(`${title}: ${detail}`, "info", "success");
};
