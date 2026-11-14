import type { GarrisonManyPlan } from "./client-garrison-many-model.js";

const escape = (value: string): string => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

// The note (why the last tapped tile was refused) wins over the plan's empty-selection prompt, which used to
// hide "Outside your reach" (2026-11-14 playtest). Once tiles are selected, a blocked plan's own reason (manpower,
// queue room) stays, so a stale refusal never hides why Confirm is disabled.
export const garrisonManyHtml = (selected: number, plan: GarrisonManyPlan, note: string): string => {
  const message = plan.blocked && selected > 0 ? plan.blocked : note || plan.blocked;
  const costs = `${plan.manpower} manpower${plan.coin ? ` · ${plan.coin} coin` : ""}`;
  return `<header><strong>Garrison Many</strong><span>${selected} selected · ${costs}</span></header>
    <div class="garrison-many-content">
      <p>Tap tiles to select or deselect.</p>
      <p class="garrison-many-message" role="status">${escape(message)}</p>
    </div>
    <nav aria-label="Garrison selection">
      <button type="button" data-garrison="confirm" class="garrison-many-primary"${plan.blocked ? " disabled" : ""}>Confirm</button>
      <button type="button" data-garrison="cancel">Cancel</button>
    </nav>`;
};
