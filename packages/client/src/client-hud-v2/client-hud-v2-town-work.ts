// What's running or queued on the town screen's selected tile: one card per
// build (construction in progress, then the tile's queued build) above the
// build list, with the buttons the legacy Progress tab gives it -- Jump to
// front and Cancel for a queued build, Rush and Cancel for construction.
// Buttons carry data-v2-work-action; runTownWorkAction runs them.

import { DEV_QUEUE_SERVER_CAP } from "@border-empires/shared";
import { pushFeed } from "../client-alerts/client-alerts.js";
import { cancelQueuedBuild, moveQueuedEntryToFront } from "../client-queue-reorder/client-queue-reorder.js";
import type { TileMenuProgressView } from "../client-types.js";
import type { HudV2Deps } from "./client-hud-v2-context.js";

export type TownWorkAction = NonNullable<TileMenuProgressView["cancelActionId"] | TileMenuProgressView["secondaryActionId"] | TileMenuProgressView["rushBuyActionId"]>;

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 1-based place within the entry's own tier (server-queued, then planned), like the legacy Progress tab; 0 when the tile has none. */
export const townQueuePosition = (queue: readonly { tileKey: string }[], tileKey: string): number => {
  const index = queue.findIndex((entry) => entry.tileKey === tileKey);
  if (index < 0) return 0;
  return index < DEV_QUEUE_SERVER_CAP ? index + 1 : index - DEV_QUEUE_SERVER_CAP + 1;
};

// Rush and cancel-construction act on the tile, and the server takes the Fort first: a second click before the
// tile updates would rush or cancel a different build than the card showed. So after one, the cards lock until
// the tile's work changes (that build finished or went away), or LOCK_MS passes if the server turned it down.
const LOCK_MS = 10_000;
let sent: { tileKey: string; sig: string; until: number } | undefined;
const workSig = (work: readonly TileMenuProgressView[]): string => work.map((w) => `${w.title}|${w.queueState ?? ""}`).join("/");

export const markTownWorkSent = (tileKey: string, work: readonly TileMenuProgressView[], nowMs = Date.now()): void => {
  sent = { tileKey, sig: workSig(work), until: nowMs + LOCK_MS };
};

export const townWorkLocked = (tileKey: string, work: readonly TileMenuProgressView[], nowMs = Date.now()): boolean =>
  Boolean(sent && sent.tileKey === tileKey && sent.sig === workSig(work) && nowMs < sent.until);

const isQueued = (w: TileMenuProgressView): boolean => w.queueState === "queued" || w.queueState === "planned";

/** The building's name: the card's state line already says queued or how long is left. */
export const workName = (w: TileMenuProgressView): string =>
  w.title.replace(/\s+(queued|planned|under construction)$/i, "");

const stateLabel = (w: TileMenuProgressView, queuePosition: number): string =>
  isQueued(w) ? `${w.queueState === "planned" ? "Planned" : "Queued"}${queuePosition > 0 ? ` · #${queuePosition}` : ""}` : w.remainingLabel;

const actButton = (label: string, ariaLabel: string, action: TownWorkAction, tileKey: string, locked: boolean, ghost = false): string =>
  `<button type="button" class="v2s-btn v2s-btn-sm${ghost ? " v2s-btn-ghost" : ""}" data-v2-work-action="${action}" data-target-key="${esc(tileKey)}" aria-label="${esc(ariaLabel)}"${locked ? " disabled" : ""}>${esc(label)}</button>`;

/** Cards for the tile's work; `queuePosition` is the queued build's place in its tier (0 when unknown); `locked` disables every button (see markTownWorkSent). */
export const townWorkHtml = (work: readonly TileMenuProgressView[], tileKey: string, queuePosition: number, locked = false): string => {
  const cards = work.map((w) => {
    const queued = isQueued(w);
    const name = workName(w);
    const cancel = w.cancelLabel === "Cancel removal" ? "Cancel removal" : "Cancel";
    const acts = [
      w.secondaryActionId === "move_queued_entry_to_front" && w.secondaryLabel ? actButton("Jump to front", `Jump ${name} to the front of the queue`, w.secondaryActionId, tileKey, locked) : "",
      w.rushBuyLabel ? actButton(w.rushBuyLabel, `Rush ${name}: ${w.rushBuyLabel}`, w.rushBuyActionId ?? "rush_buy", tileKey, locked) : "",
      w.cancelLabel ? actButton(cancel, `${cancel} ${name}`, w.cancelActionId ?? "cancel_structure_build", tileKey, locked, true) : ""
    ].join("");
    return `<div class="v2t-job${queued ? "" : " v2t-job-run"}">
      <div class="v2t-job-row"><span class="v2t-job-name">${esc(name)}</span><span class="v2t-job-state">${esc(stateLabel(w, queuePosition))}</span></div>
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
    case "rush_buy": return deps.sendGameMessage({ type: "RUSH_BUY", x, y });
    case "cancel_structure_build": return deps.sendGameMessage({ type: "CANCEL_STRUCTURE_BUILD", x, y });
    default: return false;
  }
};
