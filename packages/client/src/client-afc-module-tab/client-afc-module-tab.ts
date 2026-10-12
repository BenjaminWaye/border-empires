import { AFC_MODULE_SLOTS } from "@border-empires/shared";
import { escapeHtml } from "../client-duke-panel/client-duke-escape.js";
import { formatCooldownShort } from "../client-app-runtime-utils.js";
import type { TechInfo, Tile, TileActionDef } from "../client-types.js";

export type AfcModuleTabView = {
  owned: boolean;
  active: boolean;
  slots: { name?: string; branch?: string | undefined; state: "empty" | "house" | "captured" | "incoming"; detail: string }[];
  actions: TileActionDef[];
};

export const afcModuleTabForTile = (tile: Tile, catalog: readonly TechInfo[], actions: readonly TileActionDef[], me: string, nowMs = Date.now()): AfcModuleTabView | undefined => {
  if (!tile.afc) return undefined;
  const afc = tile.afc;
  const houseCopies = new Set(afc.houseModules ?? []);
  const installed = (afc.modules ?? []).map((id) => {
    const tech = catalog.find((entry) => entry.id === id);
    const house = houseCopies.delete(id);
    return { name: tech?.name ?? id, branch: tech?.branch, state: house ? "house" as const : "captured" as const, detail: house ? "House copy · movable" : "Captured copy · stays here" };
  });
  const incoming = (afc.incomingModules ?? []).map((entry) => {
    const tech = catalog.find((candidate) => candidate.id === entry.techId);
    return { name: tech?.name ?? entry.techId, branch: tech?.branch, state: "incoming" as const, detail: `Incoming · ${formatCooldownShort(entry.arrivesAt - nowMs)}` };
  });
  const slots: AfcModuleTabView["slots"] = [...installed, ...incoming];
  while (slots.length < AFC_MODULE_SLOTS) slots.push({ state: "empty", detail: "Empty socket" });
  const present = new Set([...(afc.modules ?? []), ...(afc.incomingModules ?? []).map((entry) => entry.techId)]);
  const owned = tile.ownerId === me && afc.ownerId === me;
  return {
    owned,
    active: afc.status === "active",
    slots,
    actions: owned && afc.status === "active" && slots.some((slot) => slot.state === "empty") ? actions.filter((action) => action.id.startsWith("redeploy_afc_module:") && !present.has(action.id.slice("redeploy_afc_module:".length))) : []
  };
};

/** Top-down socket order matches the 3D attachment ring: east, then clockwise. */
const SOCKET_CELLS = [[4, 3], [4, 4], [3, 4], [2, 4], [2, 3], [2, 2], [3, 2], [4, 2]] as const;
const branchIcon = (branch?: string): string => branch === "economy" ? "⚙" : branch === "war" ? "⚔" : branch === "manpower" ? "♟" : "✦";

export const afcModuleTabHtml = (view: AfcModuleTabView, actionHtml: (action: TileActionDef) => string): string => {
  const empty = view.slots.filter((slot) => slot.state === "empty").length;
  return `<section class="afc-module-panel" aria-label="AFC module sockets">
    <div class="afc-module-heading"><strong>Fabrication complex</strong><span>${view.slots.length - empty}/${AFC_MODULE_SLOTS} sockets occupied</span></div>
    ${view.active ? "" : '<p class="afc-module-note">Dormant · module effects are inactive.</p>'}
    <div class="afc-socket-diagram">
      <span class="afc-socket-north">N ↑</span><div class="afc-socket-core" aria-hidden="true">⚙<small>AFC</small></div>
      ${view.slots.slice(0, AFC_MODULE_SLOTS).map((slot, index) => {
        const cell = SOCKET_CELLS[index]!;
        const content = `<span class="afc-socket-number">${index + 1}</span><span class="afc-socket-icon" aria-hidden="true">${slot.state === "empty" ? "+" : branchIcon(slot.branch)}</span><span>${escapeHtml(slot.name ?? "Empty")}</span><small>${escapeHtml(slot.detail)}</small>`;
        const style = `grid-column:${cell[0]};grid-row:${cell[1]}`;
        return slot.state === "empty" && view.actions.length > 0
          ? `<button type="button" class="afc-socket is-empty" style="${style}" data-afc-call-down>${content}<small>Call down ↓</small></button>`
          : `<div class="afc-socket is-${slot.state}" style="${style}">${content}</div>`;
      }).join("")}
    </div>
    <p class="afc-module-note">Top-down view · numbered clockwise from east. Incoming modules reserve a socket; their final position is assigned on landing.</p>
    ${view.owned && view.active ? `<section class="afc-module-call-down"><strong>Call down a module</strong>
      <p class="afc-module-note">Move an unlocked module here to spread risk across your AFCs. Its movable copy leaves the current AFC immediately; captured copies stay put.</p>
      ${view.actions.length ? view.actions.map((action) => actionHtml({ ...action, label: escapeHtml(action.label) })).join("") : `<p class="afc-module-note">${empty === 0 ? "All sockets are occupied. Build another AFC for more space." : "No unlocked modules missing here are available to call down."}</p>`}
    </section>` : '<p class="afc-module-note">Call-down controls are available on active AFCs you own.</p>'}
  </section>`;
};

export const bindAfcModulePicker = (root: HTMLElement): void => {
  root.querySelectorAll<HTMLButtonElement>("button[data-afc-call-down]").forEach((button) => {
    button.onclick = () => {
      const picker = root.querySelector<HTMLElement>(".afc-module-call-down");
      picker?.scrollIntoView({ block: "nearest" });
      picker?.querySelector<HTMLButtonElement>("button[data-action]:not(:disabled)")?.focus({ preventScroll: true });
    };
  });
};
