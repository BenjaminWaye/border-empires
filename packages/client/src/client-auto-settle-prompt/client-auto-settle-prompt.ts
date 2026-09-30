// Blocking join prompt: "settle the towns/farms already in your reach for you?"
// Shown once to a brand-new player (autoSettle.answered === false) as soon as
// the server reports at least one settle candidate. Nothing auto-settles until
// they answer -- see apps/simulation's SET_AUTO_SETTLE_PREFS handler. No map
// overlay/highlighting, so there is no 2D-vs-3D renderer work here.
import { DEVELOPMENT_PROCESS_LIMIT, SETTLE_MANPOWER_COST, type AutoSettleCategory } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import {
  buildAutoSettlePromptModel,
  settleManpowerCost,
  townFoodWarning,
  yieldSummary,
  type AutoSettlePromptModel,
  type AutoSettlePromptSection
} from "./client-auto-settle-prompt-model.js";

type PromptDeps = {
  state: ClientState;
  sendGameMessage: (payload: unknown, message?: string) => boolean;
  pushFeed: (message: string, type: "info" | "combat" | "mission" | "error", severity?: "info" | "success" | "warn" | "error") => void;
  // Injected (rather than imported) so client-development-queue.ts can call refreshAutoSettlePrompt without an import cycle.
  persistDevelopmentQueue: (playerId: string, queue: ClientState["developmentQueue"]) => void;
};

type SectionUi = { count: number; auto: boolean };

let deps: PromptDeps | undefined;
let overlayEl: HTMLDivElement | undefined;
let ui: Partial<Record<AutoSettleCategory, SectionUi>> = {};
// Tiles the player has already seen and waved away. The prompt returns only for tiles not in here, so it
// is obtrusive for anything new but never nags about the same candidates twice (session memory only).
const dismissedTileKeys = new Set<string>();
let escapeListenerInstalled = false;

export const installAutoSettlePrompt = (next: PromptDeps): void => {
  deps = next;
  dismissedTileKeys.clear();
  ui = {};
  refreshAutoSettlePrompt();
};

/** Puts explicit SETTLE actions (the player's own choice in the prompt) on the client development queue. */
export const enqueueSettleTiles = (
  state: Pick<ClientState, "developmentQueue" | "me">,
  tiles: ReadonlyArray<{ x: number; y: number; tileKey: string }>,
  persist: PromptDeps["persistDevelopmentQueue"]
): number => {
  const queued = new Set(state.developmentQueue.filter((entry) => entry.kind === "SETTLE").map((entry) => entry.tileKey));
  let added = 0;
  for (const { x, y, tileKey } of tiles) {
    if (queued.has(tileKey)) continue;
    state.developmentQueue.push({ kind: "SETTLE", x, y, tileKey, label: `Settlement at (${x}, ${y})` });
    queued.add(tileKey);
    added += 1;
  }
  if (added > 0) persist(state.me, state.developmentQueue);
  return added;
};

const sectionUi = (section: AutoSettlePromptSection): SectionUi => {
  const current = ui[section.category] ?? { count: section.tiles.length, auto: false };
  current.count = Math.max(0, Math.min(current.count, section.tiles.length));
  ui[section.category] = current;
  return current;
};

const hide = (): void => {
  if (!overlayEl) return;
  overlayEl.style.display = "none";
  overlayEl.innerHTML = "";
  delete overlayEl.dataset.renderKey;
  ui = {};
};

const ensureOverlay = (): HTMLDivElement => {
  if (overlayEl && overlayEl.isConnected) return overlayEl;
  overlayEl = document.createElement("div");
  overlayEl.id = "auto-settle-prompt-overlay";
  overlayEl.style.display = "none";
  document.body.appendChild(overlayEl);
  return overlayEl;
};

const dismiss = (model: AutoSettlePromptModel): void => {
  for (const section of model.sections) for (const entry of section.tiles) dismissedTileKeys.add(entry.tileKey);
  hide();
};

const submit = (model: AutoSettlePromptModel): void => {
  if (!deps) return;
  const { state } = deps;
  // Never switches a category OFF: shown categories are only ever turned on here, the rest keep their value.
  const current = state.autoSettle;
  const prefs = { towns: current?.towns ?? false, food: current?.food ?? false, resources: current?.resources ?? false };
  const toQueue: Array<{ x: number; y: number; tileKey: string }> = [];
  for (const section of model.sections) {
    const sectionState = sectionUi(section);
    if (sectionState.auto) prefs[section.category] = true;
    else toQueue.push(...section.tiles.slice(0, sectionState.count));
  }
  if (!deps.sendGameMessage({ type: "SET_AUTO_SETTLE_PREFS", ...prefs }, "Finish sign-in before choosing settlement options.")) return;
  // Optimistic: the server's PLAYER_UPDATE confirms it.
  state.autoSettle = { answered: true, ...prefs };
  const added = enqueueSettleTiles(state, toQueue, deps.persistDevelopmentQueue);
  if (added > 0) deps.pushFeed(`Settling ${added} tile${added === 1 ? "" : "s"}.`, "info", "success");
  // Whatever the player chose not to settle now counts as seen, so it doesn't immediately re-open the prompt.
  dismiss(model);
};

const sectionHtml = (section: AutoSettlePromptSection, sectionState: SectionUi): string => {
  const total = section.tiles.length;
  const shown = sectionState.auto ? total : sectionState.count;
  const stepper =
    total > 1 && !sectionState.auto
      ? `<span class="auto-settle-stepper"><button type="button" data-step="${section.category}:-1" aria-label="Fewer">−</button><strong>${sectionState.count}</strong><button type="button" data-step="${section.category}:1" aria-label="More">+</button></span>`
      : "";
  const noun = section.category === "towns" ? "town/dock" : section.category === "food" ? "food tile" : "resource tile";
  return `
    <section class="auto-settle-section" data-category="${section.category}">
      <h3>${shown} ${noun}${shown === 1 ? "" : "s"} ${stepper}</h3>
      <p class="auto-settle-yield">${yieldSummary(section, shown) || "&nbsp;"}</p>
      <p class="auto-settle-cost">Cost ${settleManpowerCost(shown)} manpower</p>
      <label class="auto-settle-auto"><input type="checkbox" data-auto="${section.category}" ${sectionState.auto ? "checked" : ""}> Auto-settle these for me in the future</label>
    </section>`;
};

const render = (model: AutoSettlePromptModel): void => {
  if (!deps) return;
  const { state } = deps;
  const el = ensureOverlay();
  const counts = Object.fromEntries(model.sections.map((section) => [section.category, sectionUi(section)])) as Partial<Record<AutoSettleCategory, SectionUi>>;
  const foodSection = model.sections.find((section) => section.category === "food");
  const townSection = model.sections.find((section) => section.category === "towns");
  const foodShown = foodSection && counts.food ? (counts.food.auto ? foodSection.tiles.length : counts.food.count) : 0;
  const foodSlotsAdded = foodSection ? Number(yieldSummary(foodSection, foodShown).match(/\+(\d+)/)?.[1] ?? 0) : 0;
  const townShown = townSection && counts.towns ? (counts.towns.auto ? townSection.tiles.length : counts.towns.count) : 0;
  const warning = townFoodWarning(state, townSection, townShown, foodSlotsAdded);
  const totalNow = model.sections.reduce((sum, section) => sum + (counts[section.category]?.auto ? section.tiles.length : counts[section.category]?.count ?? 0), 0);
  const cost = settleManpowerCost(totalNow);
  const overBudget = cost > state.manpower;
  const key = JSON.stringify([model.sections.map((s) => [s.category, s.tiles.map((t) => t.tileKey)]), counts, Math.floor(state.manpower), state.resourceSlots]);
  if (el.dataset.renderKey === key && el.style.display !== "none") return;
  el.dataset.renderKey = key;
  el.style.display = "grid";
  el.innerHTML = `
    <div class="auto-settle-backdrop" id="auto-settle-backdrop"></div>
    <div class="auto-settle-modal card" role="dialog" aria-modal="true" aria-labelledby="auto-settle-title">
      <button type="button" class="guide-close-btn auto-settle-close" id="auto-settle-close" aria-label="Close">×</button>
      <h2 id="auto-settle-title">Settle what's in reach?</h2>
      <p class="auto-settle-lede">These tiles are already yours to settle. Settling costs manpower, so nothing happens until you choose.</p>
      ${model.sections.map((section) => sectionHtml(section, counts[section.category]!)).join("")}
      ${warning ? `<p class="auto-settle-warning">${warning}</p>` : ""}
      <p class="auto-settle-total">Total ${cost} manpower · you have ${Math.floor(state.manpower)} of ${Math.floor(state.manpowerCap)}${overBudget ? " (not enough)" : ""}</p>
      <p class="auto-settle-note">Up to ${state.developmentProcessLimit ?? DEVELOPMENT_PROCESS_LIMIT} settle at once, about a minute each (${SETTLE_MANPOWER_COST} manpower per tile).</p>
      <div class="auto-settle-actions">
        <button type="button" class="panel-btn" id="auto-settle-go" ${overBudget || totalNow === 0 ? "disabled" : ""}>Settle</button>
        <button type="button" class="panel-btn guide-secondary-btn" id="auto-settle-later">Not now</button>
      </div>
    </div>`;
  el.querySelectorAll<HTMLButtonElement>("[data-step]").forEach((button) => {
    button.onclick = () => {
      const [category, delta] = (button.dataset.step ?? "").split(":");
      const section = model.sections.find((entry) => entry.category === category);
      if (!section) return;
      const current = sectionUi(section);
      current.count = Math.max(0, Math.min(section.tiles.length, current.count + Number(delta)));
      refreshAutoSettlePrompt();
    };
  });
  el.querySelectorAll<HTMLInputElement>("[data-auto]").forEach((box) => {
    box.onchange = () => {
      const section = model.sections.find((entry) => entry.category === box.dataset.auto);
      if (!section) return;
      sectionUi(section).auto = box.checked;
      refreshAutoSettlePrompt();
    };
  });
  (el.querySelector("#auto-settle-go") as HTMLButtonElement | null)?.addEventListener("click", () => submit(model));
  for (const id of ["#auto-settle-later", "#auto-settle-close", "#auto-settle-backdrop"]) {
    (el.querySelector(id) as HTMLElement | null)?.addEventListener("click", () => dismiss(model));
  }
  if (!escapeListenerInstalled) {
    escapeListenerInstalled = true;
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !overlayEl || overlayEl.style.display === "none") return;
      const open = deps ? buildAutoSettlePromptModel(deps.state, dismissedTileKeys) : undefined;
      if (open) dismiss(open);
    });
  }
};

/** Marks every current candidate as seen (used when the player just chose their setting in Settings, so switching a category off doesn't pop the prompt at them). */
export const dismissCurrentAutoSettleCandidates = (): void => {
  if (!deps) return;
  for (const { x, y } of deps.state.autoSettlementQueue) dismissedTileKeys.add(`${x},${y}`);
  hide();
};

/** Re-evaluates whether the prompt should be showing; cheap and idempotent (called on every queue/prefs update). */
export const refreshAutoSettlePrompt = (): void => {
  if (!deps || typeof document === "undefined") return;
  // Forget dismissals for tiles that are no longer candidates so the set stays bounded by the server's queue.
  const live = new Set(deps.state.autoSettlementQueue.map((entry) => `${entry.x},${entry.y}`));
  for (const key of dismissedTileKeys) if (!live.has(key)) dismissedTileKeys.delete(key);
  const model = buildAutoSettlePromptModel(deps.state, dismissedTileKeys);
  if (model.sections.length === 0) {
    hide();
    return;
  }
  render(model);
};
