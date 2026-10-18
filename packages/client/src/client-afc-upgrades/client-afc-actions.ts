import type { ClientState } from "../client-state/client-state.js";
import type { AfcClientState } from "./client-afc-state.js";

export type AfcActionState = Pick<ClientState, "me" | "gold" | "domainIds"> & Partial<AfcClientState & Pick<ClientState, "selected" | "tiles" | "playerNames" | "activeTruces">>;
export interface AfcActionDependencies { send: (payload: unknown, message?: string) => boolean }
const escape = (text: string): string => text.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
export function renderAfcActions(state: AfcActionState): string {
  const parts: string[] = [];
  if (state.afcInstallationOutcome) parts.push(`<p role="status" class="afc-installation-outcome">${escape(state.afcInstallationOutcome)}</p>`);
  if (state.domainIds.includes("afc-exchequer-4")) parts.push(`<form data-afc-recruit><h3>Orbital recruitment</h3><p>1 Coin buys 5 manpower. Paid recruits can exceed your normal pool cap.</p><label>Coin to spend <input name="coin" type="number" min="1" max="${Math.floor(state.gold)}" step="1" value="1" required></label><button class="panel-btn" type="submit" ${state.gold < 1 ? "disabled" : ""}>Recruit ancillaries</button></form>`);
  if (state.domainIds.includes("afc-chancery-4")) {
    const remaining = Math.max(0, (state.forcedTruceCooldownUntil ?? 0) - Date.now());
    const targets = [...(state.playerNames ?? [])].filter(([id]) => id !== state.me && !id.startsWith("barbarian-") && !state.activeTruces?.some(truce => truce.otherPlayerId === id && truce.endsAt > Date.now()));
    parts.push(`<form data-afc-court><h3>Court armistice</h3><p>A binding 12h truce. Attacks already in flight finish. Recharges 48h after use.</p>${remaining ? `<p>Ready in ${Math.ceil(remaining / 3_600_000)}h</p>` : ""}<label>House <select name="target" required><option value="">Select a House</option>${targets.map(([id, name]) => `<option value="${escape(id)}">${escape(name)}</option>`).join("")}</select></label><button class="panel-btn" type="submit" ${remaining || !targets.length ? "disabled" : ""}>Impose armistice</button></form>`);
  }
  if (state.domainIds.includes("afc-oracle-4")) {
    const target = state.selected && state.tiles?.get(`${state.selected.x},${state.selected.y}`);
    const hostileTower = target && !target.fogged && target.ownerId !== state.me && target.observatory?.status === "active";
    parts.push(`<section><h3>Counterphase emitter</h3><p>Suppress a hostile tower for 5 minutes. Uses a ready tower in range and its normal Purge cooldown.</p>${hostileTower ? `<button class="panel-btn" type="button" data-afc-suppress="${target.x},${target.y}">Suppress tower at ${target.x}, ${target.y}</button>` : "<p>Select a visible hostile Aether Tower on the map.</p>"}</section>`);
  }
  if (state.domainIds.includes("afc-oracle-5")) {
    const flags = [...(state.afcDetectedFlags ?? [])].sort((a, b) => Number(b.x === state.selected?.x && b.y === state.selected?.y) - Number(a.x === state.selected?.x && a.y === state.selected?.y));
    parts.push(`<section><h3>Detected muster flags · ${flags.length}</h3><p>Exact locations only. Purge requires its Manifest, a ready tower in range, and normal shield checks.</p>${flags.length ? `<ul class="afc-detected-flags">${flags.slice(0, 32).map(flag => `<li>${escape(state.playerNames?.get(flag.ownerId) ?? flag.ownerId)} · ${flag.x}, ${flag.y}<button class="panel-btn" type="button" data-afc-purge="${flag.x},${flag.y}">Purge flag</button></li>`).join("")}</ul>` : "<p>No hostile flags detected in active tower range.</p>"}${flags.length > 32 ? "<p>Additional detections are marked on the map.</p>" : ""}</section>`);
  }
  return parts.length ? `<div class="afc-upgrade-actions">${parts.join("")}</div>` : "";
}
export function bindAfcActions(root: HTMLElement, deps: AfcActionDependencies): void {
  root.onsubmit = event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    event.preventDefault();
    const data = new FormData(form);
    if (form.hasAttribute("data-afc-recruit")) deps.send({ type: "RECRUIT_ANCILLARIES", coin: Number(data.get("coin")) }, "Could not recruit ancillaries.");
    if (form.hasAttribute("data-afc-court") && data.get("target")) deps.send({ type: "FORCE_TRUCE", targetPlayerId: String(data.get("target")) }, "Could not impose the armistice.");
  };
}
export function handleAfcActionClick(target: HTMLElement, deps: AfcActionDependencies): boolean {
  const button = target.closest<HTMLButtonElement>("[data-afc-suppress], [data-afc-purge]");
  if (!button || button.disabled) return false;
  const [x, y] = (button.dataset.afcSuppress ?? button.dataset.afcPurge ?? "").split(",").map(Number);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
  deps.send({ type: button.dataset.afcSuppress ? "SUPPRESS_AETHER_TOWER" : "AETHER_LANCE", x, y }, "Could not use the tower ability.");
  return true;
}
