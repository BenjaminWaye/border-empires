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
    ${view.active ? "" : '<p class="afc-module-note"><span class="tile-overview-dormant">⚠ Dormant — modules inactive until this AFC is reclaimed.</span></p>'}
    <div class="afc-socket-diagram">
      <span class="afc-socket-north">N ↑</span><div class="afc-socket-core" aria-hidden="true">⚙<small>AFC</small></div>
      ${view.slots.slice(0, AFC_MODULE_SLOTS).map((slot, index) => {
        const cell = SOCKET_CELLS[index]!;
        const content = `<span class="afc-socket-number">${index + 1}</span><span class="afc-socket-icon" aria-hidden="true">${slot.state === "empty" ? "+" : branchIcon(slot.branch)}</span><span>${escapeHtml(slot.name ?? "Empty")}</span><small>${escapeHtml(slot.detail)}</small>`;
        const style = `grid-column:${cell[0]};grid-row:${cell[1]}`;
        const socket = slot.state === "empty" && view.actions.length > 0
          ? `<button type="button" class="afc-socket is-empty" data-afc-call-down="${index + 1}" aria-expanded="false" aria-controls="afc-slot-picker">${content}<small>Call down ▾</small></button>`
          : `<div class="afc-socket is-${slot.state}">${content}</div>`;
        return `<div class="afc-socket-cell" style="${style}" data-afc-column="${cell[0]}">${socket}</div>`;
      }).join("")}
    </div>
    <p class="afc-module-note">Top-down view · numbered clockwise from east. Incoming modules reserve a socket; their final position is assigned on landing.</p>
    ${view.owned && view.active && view.actions.length > 0 ? `<section class="afc-module-call-down afc-slot-picker" id="afc-slot-picker" aria-labelledby="afc-slot-picker-title" hidden>
      <div class="afc-picker-heading"><strong id="afc-slot-picker-title">Call down a module</strong><button type="button" data-afc-picker-close aria-label="Close module choices">×</button></div>
      <p class="afc-module-note">Docking position is assigned on landing.</p>
      ${view.actions.map((action) => actionHtml({ ...action, label: escapeHtml(action.label) })).join("")}
    </section>` : `<p class="afc-module-note">${!view.owned || !view.active ? "Call-down controls are available on active AFCs you own." : empty === 0 ? "All sockets are occupied. Build another AFC for more space." : "No unlocked modules missing here are available to call down."}</p>`}
  </section>`;
};

export type AfcModulePickerState = {
  slot: string;
  scrollTop: number;
  focusedActionId: string | undefined;
  focusClose: boolean;
};

export const afcModulePickerStateForTitle = (root: HTMLElement, title: string): AfcModulePickerState | undefined => {
  if (root.querySelector(".tile-action-title")?.textContent !== title) return undefined;
  const trigger = root.querySelector<HTMLButtonElement>('button[data-afc-call-down][aria-expanded="true"]');
  const picker = root.querySelector<HTMLElement>(".afc-slot-picker");
  if (!trigger?.dataset.afcCallDown || !picker || picker.hidden) return undefined;
  const focused = root.ownerDocument.activeElement;
  const control = focused instanceof HTMLButtonElement && picker.contains(focused) ? focused : undefined;
  return { slot: trigger.dataset.afcCallDown, scrollTop: picker.scrollTop, focusedActionId: control?.dataset.action, focusClose: control?.hasAttribute("data-afc-picker-close") ?? false };
};

export const fitAfcModulePicker = (root: HTMLElement): void => {
  const picker = root.querySelector<HTMLElement>(".afc-slot-picker");
  const body = root.querySelector<HTMLElement>("[data-tile-menu-scroll]");
  if (picker && !picker.hidden && body && body.clientHeight > 0) {
    picker.style.setProperty("--afc-picker-height", `${Math.min(320, body.clientHeight)}px`);
  }
};

export const bindAfcModulePicker = (root: HTMLElement, restore?: AfcModulePickerState): void => {
  const picker = root.querySelector<HTMLElement>(".afc-slot-picker");
  const card = root.querySelector<HTMLElement>(".tile-action-card");
  if (!picker || !card) return;
  let activeButton: HTMLButtonElement | undefined;
  const close = (restoreFocus: boolean): void => {
    picker.hidden = true;
    const previous = activeButton;
    previous?.setAttribute("aria-expanded", "false");
    previous?.classList.remove("is-selected");
    previous?.parentElement?.classList.remove("is-picker-open");
    activeButton = undefined;
    if (restoreFocus) previous?.focus();
  };
  const open = (button: HTMLButtonElement): void => {
    close(false);
    activeButton = button;
    button.setAttribute("aria-expanded", "true");
    button.classList.add("is-selected");
    button.parentElement?.classList.add("is-picker-open");
    button.parentElement?.append(picker);
    const title = picker.querySelector<HTMLElement>("#afc-slot-picker-title");
    if (title) title.textContent = `Call down · Socket ${button.dataset.afcCallDown}`;
    picker.hidden = false;
    fitAfcModulePicker(root);
  };
  root.querySelectorAll<HTMLButtonElement>("button[data-afc-call-down]").forEach((button) => {
    button.onclick = () => {
      if (activeButton === button) { close(true); return; }
      open(button);
      picker.scrollIntoView({ block: "nearest" });
      (picker.querySelector<HTMLButtonElement>("button[data-action]:not(:disabled)") ?? closeButton)?.focus({ preventScroll: true });
    };
  });
  const closeButton = picker.querySelector<HTMLButtonElement>("button[data-afc-picker-close]");
  if (closeButton) closeButton.onclick = () => close(true);
  // The card is replaced on each menu render. Binding here avoids retaining
  // listeners or picker state on the persistent menu root/document.
  card.onclick = (event) => {
    if (activeButton && event.target instanceof Element && picker.contains(event.target) && event.target.closest("button[data-action]")) { close(false); return; }
    if (activeButton && event.target instanceof Node && !activeButton.contains(event.target) && !picker.contains(event.target)) close(false);
  };
  card.onkeydown = (event) => {
    if (event.key !== "Escape" || !activeButton) return;
    event.preventDefault();
    event.stopPropagation();
    close(true);
  };
  if (restore) {
    const trigger = Array.from(root.querySelectorAll<HTMLButtonElement>("button[data-afc-call-down]")).find((button) => button.dataset.afcCallDown === restore.slot);
    if (!trigger) return; // The slot filled, or its call-down eligibility changed.
    // Reopen without scrolling the menu or stealing focus on every timer tick.
    open(trigger);
    const choices = Array.from(picker.querySelectorAll<HTMLButtonElement>("button[data-action]:not(:disabled)"));
    const focused = restore.focusClose ? closeButton : restore.focusedActionId ? choices.find((button) => button.dataset.action === restore.focusedActionId) ?? choices[0] ?? closeButton : undefined;
    focused?.focus({ preventScroll: true });
    picker.scrollTop = restore.scrollTop;
  }
};
