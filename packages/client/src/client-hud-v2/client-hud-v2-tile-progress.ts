// Progress stays in the tile panel; its controls use the menu's existing handlers.
import { battleOddsBarHtml } from "../client-tile-menu-html.js";
import type { TileMenuProgressView } from "../client-types.js";

const esc = (text: string): string => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const button = (label: string | undefined, action: string): string => label
  ? `<button type="button" class="v2s-btn v2s-btn-sm" data-v2-progress-action="${esc(action)}">${esc(label)}</button>` : "";

export const tileProgressHtml = (work: TileMenuProgressView | undefined): string => {
  if (!work) return "";
  return `<div class="hud-v2-pop" role="region" aria-label="Tile progress"><div class="v2t-job v2t-job-run">
    <div class="v2t-job-row"><span class="v2t-job-name">${esc(work.title)}</span><span class="v2t-job-state">${esc(work.remainingLabel)}</span></div>
    <div class="v2t-job-bar"><span style="width:${Math.round(Math.max(0, Math.min(1, work.progress)) * 100)}%"></span></div>
    ${work.battle ? battleOddsBarHtml(work.battle) : ""}
    ${work.note ? `<span class="v2t-built-mods">${esc(work.note)}</span>` : ""}
    <div class="v2t-job-acts">${button(work.rushBuyLabel, work.rushBuyActionId ?? "rush_buy")}${button(work.secondaryLabel, work.secondaryActionId ?? "move_queued_entry_to_front")}${button(work.cancelLabel, work.cancelActionId ?? "cancel_structure_build")}</div>
    ${(work.queuedNext ?? []).map((next) => `<div class="v2t-built-mods">${esc(next.title)}${button(next.cancelLabel, next.cancelActionId)}</div>`).join("")}
  </div></div>`;
};
