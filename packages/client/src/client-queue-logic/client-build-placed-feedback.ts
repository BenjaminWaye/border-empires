// Feedback for a player-pressed Place: the build either starts now or joins
// the development queue, and without this neither showed anything (playtest:
// "I press Place and get no feedback"). Only BUILD_STRUCTURE presses announce
// -- removals and queue drains (fromQueue) stay silent.
import type { VisibleActionWarningDeps } from "../client-visible-action-warning.js";

export type BuildPlacedOutcome = "started" | "queued";

export const announceBuildPlaced = (
  deps: VisibleActionWarningDeps,
  payloadType: string,
  label: string,
  outcome: BuildPlacedOutcome,
  opts: { fromQueue?: boolean; suppressWarnings?: boolean }
): void => {
  if (payloadType !== "BUILD_STRUCTURE" || opts.fromQueue || opts.suppressWarnings) return;
  const title = outcome === "started" ? "Building placed" : "Build queued";
  const detail = outcome === "started" ? `${label} — construction started.` : `${label} — starts when a development slot frees up.`;
  deps.showCaptureAlert?.(title, detail, "success");
  deps.pushFeed(`${title}: ${detail}`, "info", "success");
};
