import type { GarrisonManyPlan } from "./client-garrison-many-model.js";

const escape = (value: string): string => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

export const garrisonManyHtml = (selected: number, plan: GarrisonManyPlan, note: string): string => {
  const costs = `${plan.manpower} manpower${plan.coin ? ` · ${plan.coin} coin` : ""}`;
  return `<header><strong>Garrison Many</strong><span>${selected} selected · ${costs}</span></header>
    <div class="garrison-many-content">
      <p>Tap tiles to select or deselect.</p>
      <p class="garrison-many-message" role="status">${escape(plan.blocked || note)}</p>
    </div>
    <nav aria-label="Garrison selection">
      <button type="button" data-garrison="confirm" class="garrison-many-primary"${plan.blocked ? " disabled" : ""}>Confirm</button>
      <button type="button" data-garrison="cancel">Cancel</button>
    </nav>`;
};
