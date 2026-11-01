// What's running or queued on the town screen's selected tile: one card per
// build (construction in progress, then the tile's queued build) above the
// build list, with the buttons the legacy Progress tab gives it -- Jump to
// front and Cancel for a queued build, Rush and Cancel for construction.
// Buttons carry data-v2-work-action; runTownWorkAction runs them.

import { pushFeed } from "../client-alerts/client-alerts.js";
import { cancelQueuedBuild, cancelQueuedSettlement, moveQueuedEntryToFront } from "../client-queue-reorder/client-queue-reorder.js";
import type { TileMenuProgressView } from "../client-types.js";
import type { HudV2Deps } from "./client-hud-v2-context.js";

export type TownWorkAction = NonNullable<TileMenuProgressView["cancelActionId"] | TileMenuProgressView["secondaryActionId"] | TileMenuProgressView["rushBuyActionId"]>;

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const isQueued = (w: TileMenuProgressView): boolean => w.queueState === "queued" || w.queueState === "planned";

/** The building's name: the card's state line already says queued or how long is left. */
export const workName = (w: TileMenuProgressView): string =>
  w.title.replace(/\s+(queued|planned|under construction)$/i, "");

const stateLabel = (w: TileMenuProgressView, queuePosition: number): string =>
  isQueued(w) ? `${w.queueState === "planned" ? "Planned" : "Queued"}${queuePosition > 0 ? ` · #${queuePosition}` : ""}` : w.remainingLabel;

const actButton = (label: string, action: TownWorkAction, tileKey: string, ghost = false): string =>
  `<button type="button" class="v2s-btn v2s-btn-sm${ghost ? " v2s-btn-ghost" : ""}" data-v2-work-action="${action}" data-target-key="${esc(tileKey)}">${esc(label)}</button>`;

/** Cards for the tile's work; `queuePosition` is the queued build's 1-based place in your build queue (0 when unknown). */
export const townWorkHtml = (work: readonly TileMenuProgressView[], tileKey: string, queuePosition: number): string => {
  const cards = work.map((w) => {
    const queued = isQueued(w);
    const acts = [
      w.secondaryActionId === "move_queued_entry_to_front" && w.secondaryLabel ? actButton("Jump to front", w.secondaryActionId, tileKey) : "",
      w.rushBuyLabel ? actButton(w.rushBuyLabel, w.rushBuyActionId ?? "rush_buy", tileKey) : "",
      w.cancelLabel ? actButton("Cancel", w.cancelActionId ?? "cancel_structure_build", tileKey, true) : ""
    ].join("");
    return `<div class="v2t-job${queued ? "" : " v2t-job-run"}">
      <div class="v2t-job-row"><span class="v2t-job-name">${esc(workName(w))}</span><span class="v2t-job-state">${esc(stateLabel(w, queuePosition))}</span></div>
      ${queued ? "" : `<div class="v2t-job-bar"><span style="width:${Math.round(Math.max(0, Math.min(1, w.progress)) * 100)}%"></span></div>`}
      ${acts ? `<div class="v2t-job-acts">${acts}</div>` : ""}
    </div>`;
  });
  return cards.length > 0 ? `<div class="v2t-work">${cards.join("")}</div>` : "";
};

/** Runs a card button on its tile. Server-side work (rush, cancel construction) waits for the tile update rather than guessing. */
export const runTownWorkAction = (deps: Pick<HudV2Deps, "state" | "renderHud" | "sendGameMessage">, action: string, tileKey: string): boolean => {
  const { state } = deps;
  const queueDeps = { pushFeed: (msg: string, type?: Parameters<typeof pushFeed>[2], severity?: Parameters<typeof pushFeed>[3]) => pushFeed(state, msg, type, severity), renderHud: deps.renderHud, sendGameMessage: deps.sendGameMessage };
  const [x, y] = tileKey.split(",").map(Number);
  switch (action) {
    case "move_queued_entry_to_front": return moveQueuedEntryToFront(state, tileKey, queueDeps);
    case "cancel_queued_build": return cancelQueuedBuild(state, tileKey, queueDeps);
    case "cancel_queued_settlement": return cancelQueuedSettlement(state, tileKey, queueDeps);
    case "rush_buy": return deps.sendGameMessage({ type: "RUSH_BUY", x, y });
    case "cancel_structure_build": return deps.sendGameMessage({ type: "CANCEL_STRUCTURE_BUILD", x, y });
    default: return false;
  }
};
