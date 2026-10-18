import type { GarrisonManyReview } from "./client-garrison-many-model.js";

const escape = (value: string): string => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const button = (action: string, label: string, disabled = false, primary = false): string =>
  `<button type="button" data-garrison="${action}"${disabled ? " disabled" : ""}${primary ? ' class="garrison-many-primary"' : ""}>${label}</button>`;

export const garrisonManyHtml = (selected: number, plan: GarrisonManyReview, reviewing: boolean, note: string, stale = false): string => {
  const costs = `${plan.manpower} manpower${plan.coin ? ` · ${plan.coin} coin` : ""}`;
  return `<header><strong>${reviewing ? "Review garrisons" : "Garrison Many"}</strong><span>${selected} selected · ${costs}</span></header>
    <div class="garrison-many-content"><p>${reviewing ? `${plan.tiles.length} eligible · up to ${plan.canStart} start · ${plan.waiting} waiting` : "Tap frontier tiles to select or deselect. Drag to pan; pinch to zoom."}</p>
    ${reviewing ? `<details><summary>Review ${plan.tiles.length} tiles${plan.excluded.length ? ` · ${plan.excluded.length} excluded` : ""}</summary><ul>${plan.tiles.map((tile) => `<li>(${tile.x}, ${tile.y}) — garrison</li>`).join("")}${plan.excluded.map((entry) => `<li>(${escape(entry.key)}) — excluded: ${escape(entry.reason)}</li>`).join("")}</ul></details><p>Queued in order; paid as each garrison starts.${plan.reservedManpower ? ` Existing queued garrisons need ${plan.reservedManpower} manpower.` : ""}</p>` : ""}
    <p class="garrison-many-message" role="status">${escape([note, plan.blocked].filter(Boolean).join(" "))}</p></div>
    <nav aria-label="Garrison selection">${reviewing ? button("edit", "Edit selection") + button("confirm", stale ? "Review changes" : `Confirm ${plan.tiles.length}`, !stale && Boolean(plan.blocked), true) : button("connected", "Select connected") + button("clear", "Clear", !selected) + button("review", "Review", !selected, true)}${button("cancel", "Cancel")}</nav>`;
};
