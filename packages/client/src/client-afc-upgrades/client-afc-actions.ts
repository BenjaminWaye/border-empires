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
    parts.push(`<section><h3>Counterphase emitter</h3><p>Suppress a hostile tower for 5 minutes. Uses one shot of a tower in range.</p>${hostileTower ? `<button class="panel-btn" type="button" data-afc-suppress="${target.x},${target.y}">Suppress tower at ${target.x}, ${target.y}</button>` : "<p>Select a visible hostile Aether Tower on the map.</p>"}</section>`);
  }
  if (state.domainIds.includes("afc-oracle-5")) {
    const target = state.selected && state.tiles?.get(`${state.selected.x},${state.selected.y}`);
    const now = Date.now();
    const tower = target && !target.fogged && target.ownerId !== state.me ? target.observatory : undefined;
    const open = tower?.status === "active" && ((tower.suppressedUntil ?? 0) > now || (tower.cooldownUntil ?? 0) > now);
    const ready = Math.max(0, (state.hijackReadyAt ?? 0) - now);
    const hint = !tower ? "Select a visible hostile Aether Tower on the map." : !open ? "This tower still has a shot left. Wait until it fires its last shot, or suppress it with Counterphase." : ready ? `Ready again in ${Math.ceil(ready / 3_600_000)}h.` : "";
    parts.push(`<section><h3>Resonance hijack</h3><p>Seize a hostile tower that has no shot left or is suppressed. Uses one shot of a tower in range and takes 10 minutes; your casting tower is revealed while it runs. Once per 24h.</p>${hint ? `<p>${hint}</p>` : `<button class="panel-btn" type="button" data-afc-hijack="${target!.x},${target!.y}">Hijack tower at ${target!.x}, ${target!.y}</button>`}</section>`);
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
  const button = target.closest<HTMLButtonElement>("[data-afc-suppress], [data-afc-hijack]");
  if (!button || button.disabled) return false;
  const [x, y] = (button.dataset.afcSuppress ?? button.dataset.afcHijack ?? "").split(",").map(Number);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
  deps.send({ type: button.dataset.afcSuppress ? "SUPPRESS_AETHER_TOWER" : "HIJACK_AETHER_TOWER", x, y }, "Could not use the tower ability.");
  return true;
}
