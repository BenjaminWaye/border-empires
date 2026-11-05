import { isRedesignedRelic, RELIC_DEFINITIONS, relicOperationalState, relicReserveLabel, relicRemainingUses, worldSeed, type NaturalWonderState, type NaturalWonderType } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import "./relic-capture-dialog.css";

const atlas = new URL("./artwork/installation-atlas-v1.jpg", import.meta.url).href;
const armour = new URL("./artwork/armour-works-v1.jpg", import.meta.url).href;
const PANELS: Readonly<Record<NaturalWonderType, [number, number]>> = {
  FOUNDRY_HEART: [0, 0], DEEPWATER_ENGINE: [1, 0], CONSCRIPTION_ENGINE: [2, 0],
  WARPRESS: [0, 1], BASTION_FRAME: [1, 1], CALCULATING_ENGINE: [2, 1],
  QUICKFORGE: [0, 2], WATCHTOWER_ENGINE: [1, 2], CARTOGRAPHERS_LENS: [2, 2]
};

export function createRelicCaptureDialog(state: NaturalWonderState, garrisoned: boolean, secured = true): HTMLDialogElement {
  const definition = RELIC_DEFINITIONS[state.type];
  const status = relicOperationalState(state, garrisoned);
  const dialog = document.createElement("dialog");
  dialog.className = "relic-capture-dialog";
  dialog.setAttribute("aria-label", definition.name);
  dialog.innerHTML = `<header><div class="relic-dialog-eyebrow">${secured ? "RELIC SECURED" : "CONCORDANCE INSTALLATION"}</div><button class="relic-dialog-close" type="button" autofocus aria-label="Close relic details">×</button><h1></h1><p class="relic-installation"></p></header>
    <figure><div class="relic-art" role="img"></div><figcaption>Surface access structure · buried installation · illustrative section</figcaption></figure>
    <section class="relic-dialog-copy"><p class="relic-description"></p><div class="relic-effect"><span class="relic-status"></span><p class="relic-benefit"></p><p class="relic-allocation"></p><p class="relic-reserve"></p></div><p class="relic-footnote"></p></section>
    <footer><button class="relic-dialog-continue" type="button">Continue →</button></footer>`;
  const set = (selector: string, value: string): void => { const node = dialog.querySelector(selector); if (node) node.textContent = value; };
  set("h1", definition.name); set(".relic-installation", definition.installation);
  set(".relic-description", definition.description);
  set(".relic-status", status === "depleted" ? "DEPLETED" : garrisoned ? "INSTALLATION ACTIVE" : "GARRISON TO ACTIVATE");
  set(".relic-benefit", status === "depleted" ? "The surviving reserve is exhausted. This site cannot provide another reserve this campaign." : definition.benefit);
  set(".relic-allocation", state.resourceBonus ? `Recovered supply: +${state.resourceBonus.amount} ${state.resourceBonus.resource} capacity, available to a holder who has revealed that resource.` : "");
  set(".relic-reserve", relicReserveLabel(state) ?? "");
  set(".relic-footnote", "The installation remains part of the planet. Taking it from another House does not replenish its reserves.");
  const art = dialog.querySelector<HTMLElement>(".relic-art")!;
  art.setAttribute("aria-label", `Cutaway artwork of a weathered ziggurat above ${definition.installation.toLowerCase()}`);
  if (state.type === "WARPRESS") { art.style.backgroundImage = `url("${armour}")`; art.classList.add("relic-art--armour"); }
  else { const [x, y] = PANELS[state.type]; art.style.backgroundImage = `url("${atlas}")`; art.style.backgroundPosition = `${x * 50}% ${y * 50}%`; }
  if (relicRemainingUses(state) === 0) dialog.classList.add("relic-dialog--depleted");
  let previousFocus: HTMLElement | undefined;
  dialog.addEventListener("beforetoggle", event => {
    if ("newState" in event && event.newState === "open") previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
  });
  const close = (): void => dialog.close();
  dialog.querySelector(".relic-dialog-close")?.addEventListener("click", close);
  dialog.querySelector(".relic-dialog-continue")?.addEventListener("click", close);
  dialog.addEventListener("close", () => { if (previousFocus?.isConnected) previousFocus.focus(); });
  return dialog;
}

export function showRelicDetails(state: NaturalWonderState, garrisoned: boolean): void {
  document.querySelector<HTMLDialogElement>(".relic-capture-dialog[open]")?.close();
  const dialog = createRelicCaptureDialog(state, garrisoned, false);
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  document.body.append(dialog); dialog.showModal();
}

const SEEN_KEY = "be-relic-reveals-v1";
let noticeTimer: number | undefined;
/** One bounded list for the current world/viewer, independent of reserve accounting. */
export function notifyRelicCapture(existing: Tile | undefined, tile: Tile, viewerId: string | undefined): void {
  if (typeof document === "undefined" || !existing || !viewerId || tile.ownerId !== viewerId || existing?.ownerId === viewerId || !tile.naturalWonder || !isRedesignedRelic(tile.naturalWonder) || tile.fogged) return;
  const namespace = `${worldSeed()}:${viewerId}`;
  const key = `${tile.x},${tile.y}`;
  let seen: string[] = [];
  try { const saved: unknown = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "null"); if (saved && typeof saved === "object" && "namespace" in saved && saved.namespace === namespace && "keys" in saved && Array.isArray(saved.keys)) seen = saved.keys.filter((v): v is string => typeof v === "string").slice(-9); } catch { /* Storage is optional. */ }
  const first = !seen.includes(key);
  if (first) { try { localStorage.setItem(SEEN_KEY, JSON.stringify({ namespace, keys: [...seen, key].slice(-9) })); } catch { /* Storage is optional. */ } }
  const state = tile.naturalWonder;
  queueMicrotask(() => {
    if (first && !document.querySelector(".relic-capture-dialog[open]")) {
      const dialog = createRelicCaptureDialog(state, tile.ownershipState === "SETTLED");
      dialog.addEventListener("close", () => dialog.remove(), { once: true }); document.body.append(dialog); dialog.showModal();
    } else {
      document.querySelector(".relic-recapture-notice")?.remove();
      if (noticeTimer !== undefined) window.clearTimeout(noticeTimer);
      const notice = document.createElement("div"); notice.className = "relic-recapture-notice"; notice.setAttribute("role", "status");
      notice.textContent = `${RELIC_DEFINITIONS[state.type].name} secured. ${relicReserveLabel(state) ?? "Garrison to operate."} `;
      const button = document.createElement("button"); button.textContent = "View relic"; button.onclick = () => { showRelicDetails(state, tile.ownershipState === "SETTLED"); notice.remove(); }; notice.append(button); document.body.append(notice);
      noticeTimer = window.setTimeout(() => { notice.remove(); noticeTimer = undefined; }, 12000);
    }
  });
}

if (typeof document !== "undefined") document.addEventListener("click", event => {
  const button = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-relic-state]") : null;
  if (!button?.dataset.relicState) return;
  try { const state: NaturalWonderState = JSON.parse(decodeURIComponent(button.dataset.relicState)); if (isRedesignedRelic(state) && state.type in RELIC_DEFINITIONS) showRelicDetails(state, button.dataset.relicGarrisoned === "true"); } catch { /* Ignore invalid UI attributes. */ }
});
