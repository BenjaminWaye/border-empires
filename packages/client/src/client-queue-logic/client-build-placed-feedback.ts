// Feedback for a player-pressed Place: the build either starts now or joins
// the development queue, and without this neither showed anything (playtest:
// "I press Place and get no feedback"). Deliberately not the big capture-alert
// banner (unwanted). The HUD reads lastBuildPlaced to flash the Place button
// "✓ Placed" / "✓ Queued" (client-hud-v2-build-list.ts); the feed line serves
// the legacy HUD, whose Alerts panel shows the feed. Only BUILD_STRUCTURE
// presses announce -- removals and queue drains (fromQueue) stay silent.
import type { VisibleActionWarningDeps } from "../client-visible-action-warning.js";

export type BuildPlacedOutcome = "started" | "queued";

/** How long the Place button shows its confirmation. */
export const BUILD_PLACED_FLASH_MS = 1_600;

let lastPlaced: { outcome: BuildPlacedOutcome; at: number } | undefined;

/** The outcome of the latest Place press, while its confirmation is still showing. */
export const lastBuildPlaced = (nowMs = Date.now()): BuildPlacedOutcome | undefined =>
  lastPlaced && nowMs - lastPlaced.at < BUILD_PLACED_FLASH_MS ? lastPlaced.outcome : undefined;

export const announceBuildPlaced = (
  deps: VisibleActionWarningDeps,
  payloadType: string,
  label: string,
  outcome: BuildPlacedOutcome,
  opts: { fromQueue?: boolean; suppressWarnings?: boolean }
): void => {
  if (payloadType !== "BUILD_STRUCTURE" || opts.fromQueue || opts.suppressWarnings) return;
  lastPlaced = { outcome, at: Date.now() };
  const title = outcome === "started" ? "Building placed" : "Build queued";
  const detail = outcome === "started" ? `${label} — construction started.` : `${label} — starts when a development slot frees up.`;
  deps.pushFeed(`${title}: ${detail}`, "info", "success");
};
