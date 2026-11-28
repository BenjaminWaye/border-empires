// What a FRONTIER_RESULT (the server finished a claim) tells the player.
// Extracted from client-network.ts (over the 500-line limit) when the claim
// toast was added (first-15 playtest r1, pt-predator: "After an expand, a
// clearer 'claimed' confirmation"). A manual claim writes the feed line and
// hands the battle screen its result as before. Every claim the player can't
// already see resolve gets a short "Land claimed": the last tile of an
// Expand To, or a single claim. Tiles in the middle of a longer Expand To
// stay quiet (that silence is why the chain is silent), and a town has its
// own "Town Captured" card.
import { focusFromAlert } from "../client-alerts/client-alerts.js";
import { showActionToast } from "./client-action-toast.js";

type Point = { x: number; y: number };

export type FrontierClaimInput = {
  target: Point | undefined;
  actionType: unknown;
  /** The claim belongs to a silent (queued / Expand To) EXPAND. */
  silent: boolean;
  /** Expand To destinations still pending. */
  waypointTargets: readonly Point[];
  claimedTown: boolean;
};

export type FrontierClaimDeps = {
  appendFeedEntry: (entry: { title: string; text: string; type: "combat"; severity: "success"; at: number; focusX?: number; focusY?: number; actionLabel?: string }) => void;
  showCaptureAlert: (title: string, detail: string, tone: "success", manpowerLoss?: number, focus?: { x: number; y: number; actionLabel?: string }) => void;
};

/** True while an Expand To is still on its way somewhere other than this tile. */
const midChain = (target: Point, waypointTargets: readonly Point[]): boolean =>
  waypointTargets.some((w) => w.x !== target.x || w.y !== target.y);

export const announceFrontierClaim = (input: FrontierClaimInput, deps: FrontierClaimDeps): void => {
  const { target } = input;
  const resultAlert = {
    title: "Territory Claimed",
    detail: target ? `Territory at (${target.x}, ${target.y}) was claimed.` : "Territory was claimed.",
    tone: "success" as const,
    ...(target ? { focusX: target.x, focusY: target.y, actionLabel: "Center" } : {})
  };
  // Waypoint-driven neutral EXPAND: no feed entry or battle-screen result per tile. The user already opted
  // into the chain via Expand To. Errors still surface via the captureAlert path in client-network.ts.
  if (!input.silent) {
    appendFeedEntryFor(deps, resultAlert);
    deps.showCaptureAlert(resultAlert.title, resultAlert.detail, resultAlert.tone, undefined, focusFromAlert(resultAlert));
  }
  if (!target || input.actionType === "ATTACK" || input.claimedTown) return;
  if (input.silent && midChain(target, input.waypointTargets)) return;
  showActionToast("Land claimed");
};

const appendFeedEntryFor = (deps: FrontierClaimDeps, alert: { title: string; detail: string; focusX?: number; focusY?: number; actionLabel?: string }): void =>
  deps.appendFeedEntry({
    title: alert.title,
    text: alert.detail,
    type: "combat",
    severity: "success",
    at: Date.now(),
    ...(typeof alert.focusX === "number" && typeof alert.focusY === "number"
      ? { focusX: alert.focusX, focusY: alert.focusY, actionLabel: alert.actionLabel ?? "Center" }
      : {})
  });
