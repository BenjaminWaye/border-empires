import type { FeedEntry, SurveySweepPingKind } from "../client-types.js";

type SweepFinding = { x: number; y: number; kind: SurveySweepPingKind };

const MAX_LISTED_PER_KIND = 8;

const listCoordinates = (findings: SweepFinding[]): string => {
  const shown = findings.slice(0, MAX_LISTED_PER_KIND).map((ping) => `(${ping.x}, ${ping.y})`);
  const hidden = findings.length - shown.length;
  return hidden > 0 ? `${shown.join(", ")} +${hidden} more` : shown.join(", ");
};

/** Activity Feed entry that records what a Survey Sweep found, with coordinates and a
 * jump-to-site button, so the player can revisit the findings after the map pings fade. */
export const surveySweepFeedEntry = (pings: SweepFinding[], at: number): FeedEntry => {
  const resources = pings.filter((ping) => ping.kind === "resource");
  const towns = pings.filter((ping) => ping.kind === "town");
  const summary = `Survey Sweep found ${resources.length} resource ${resources.length === 1 ? "site" : "sites"} and ${towns.length} ${towns.length === 1 ? "town" : "towns"} outside current vision.`;
  const details = [
    resources.length > 0 ? `Resources: ${listCoordinates(resources)}.` : "",
    towns.length > 0 ? `Towns: ${listCoordinates(towns)}.` : ""
  ].filter(Boolean);
  const first = resources[0] ?? towns[0];
  return {
    text: [summary, ...details].join(" "),
    type: "info",
    severity: "success",
    at,
    ...(first ? { focusX: first.x, focusY: first.y, actionLabel: "Go to first site" } : {})
  };
};
