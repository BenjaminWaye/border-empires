// The House Charges side panel (docs/house-charges-plan.md, "Player guidance"):
// the House's sealed charges, whether each is held now, the keep-two choice
// while it is open, and "Show on map". Opened from the HUD's Charges bubble.
import { HOUSE_CHARGES_KEPT, type HouseChargeView } from "@border-empires/shared";
import { focusCameraOnTile } from "../client-activity-dashboard/client-activity-dashboard-center.js";
import type { ClientState } from "../client-state/client-state.js";
import { HOUSE_CHARGE_KIND_LABEL, HOUSE_CHARGE_RARITY_LABEL, houseChargeObjective, houseChargeProgress } from "./client-house-charges-labels.js";

export type HouseChargesPanelDeps = {
  readonly root: ParentNode;
  readonly panelEl: HTMLElement;
  readonly rerender: () => void;
  readonly requestViewRefresh: (priorityBoost?: number, immediate?: boolean) => void;
  readonly sendGameMessage: (payload: unknown, message?: string) => boolean;
  readonly wrapX: (x: number) => number;
  readonly wrapY: (y: number) => number;
  readonly now: () => number;
};

type PanelState = Pick<ClientState, "activePanel" | "houseCharges" | "houseChargesDraftKeep">;

const escapeHtml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const formatWhen = (epochMs: number): string =>
  new Date(epochMs).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });

/** Where "Show on map" goes: the target once known, otherwise the search circle. */
export const houseChargeFocusPoint = (charge: HouseChargeView): { x: number; y: number } => charge.targets[0] ?? charge.searchCircle;

const chargeCardHtml = (charge: HouseChargeView, choosing: boolean, ticked: boolean): string => {
  const progress = houseChargeProgress(charge);
  const status = !charge.kept && !choosing
    ? '<span class="house-charge-status is-dropped">Not kept</span>'
    : charge.held
      ? `<span class="house-charge-status is-held">Held${charge.completeSince ? ` since ${escapeHtml(formatWhen(charge.completeSince))}` : ""}</span>`
      : charge.kept ? '<span class="house-charge-status">Not held</span>' : "";
  const pips = `<span class="house-charge-pips" aria-label="Renown ${charge.renown}">${"◆".repeat(Math.max(1, Math.min(4, charge.renown)))}</span>`;
  const keep = choosing
    ? `<label class="house-charge-keep"><input type="checkbox" data-house-charge-keep="${escapeHtml(charge.id)}"${ticked ? " checked" : ""}> Keep</label>`
    : "";
  return `<article class="house-charge-card kind-${charge.kind.toLowerCase()} rarity-${charge.rarity.toLowerCase()}${charge.kept ? "" : " is-unkept"}">
    <header class="house-charge-head"><strong class="house-charge-title">${escapeHtml(charge.title)}</strong>${pips}</header>
    <div class="house-charge-type">${HOUSE_CHARGE_KIND_LABEL[charge.kind]} · ${HOUSE_CHARGE_RARITY_LABEL[charge.rarity]}</div>
    <p class="house-charge-objective">${escapeHtml(houseChargeObjective(charge))}</p>
    ${progress ? `<p class="house-charge-progress">${escapeHtml(progress)}</p>` : ""}
    <footer class="house-charge-foot">${status}${keep}<button class="panel-btn" type="button" data-house-charge-jump="${escapeHtml(charge.id)}">Show on map</button></footer>
  </article>`;
};

export const houseChargesPanelHtml = (state: PanelState, nowMs: number): string => {
  const payload = state.houseCharges;
  if (!payload) {
    return `<section class="card house-charges-card"><p class="house-charges-intro">Your House's sealed charges arrive once your AFC has landed.</p></section>`;
  }
  if (payload.charges.length === 0) {
    return `<section class="card house-charges-card"><p class="house-charges-intro">Your House sent no charges for this world: nothing near your landing site qualified.</p></section>`;
  }
  const wanted = Math.min(HOUSE_CHARGES_KEPT, payload.charges.length);
  const choosing = nowMs < payload.choiceClosesAt && payload.charges.length > wanted;
  const kept = payload.charges.filter((charge) => charge.kept).map((charge) => charge.id);
  const draft = state.houseChargesDraftKeep ?? kept;
  const changed = [...draft].sort().join("|") !== [...kept].sort().join("|");
  const choice = choosing
    ? `<div class="house-charges-choice">
        <p>Keep ${wanted} of these ${payload.charges.length}. You can change your choice until ${escapeHtml(formatWhen(payload.choiceClosesAt))}.</p>
        <button class="panel-btn" type="button" data-house-charges-save${changed && draft.length === wanted ? "" : " disabled"}>Keep these ${wanted}</button>
      </div>`
    : "";
  const ordered = [...payload.charges].sort((a, b) => Number(b.kept) - Number(a.kept));
  return `<section class="card house-charges-card">
    <p class="house-charges-intro">Sealed charges from your House. A charge counts only if you still hold it when this Sector Contest's winner is crowned. Nobody else can see them until then.</p>
    ${choice}
    <div class="house-charges-list">${ordered.map((charge) => chargeCardHtml(charge, choosing, draft.includes(charge.id))).join("")}</div>
  </section>`;
};

export const renderHouseChargesPanel = (
  state: PanelState & Pick<ClientState, "camX" | "camY" | "camSubX" | "camSubY" | "selected">,
  deps: HouseChargesPanelDeps
): void => {
  if (state.activePanel !== "charges") {
    if (deps.panelEl.innerHTML !== "") deps.panelEl.innerHTML = "";
    return;
  }
  const html = houseChargesPanelHtml(state, deps.now());
  if (deps.panelEl.innerHTML !== html) deps.panelEl.innerHTML = html;
  const payload = state.houseCharges;
  if (!payload) return;
  deps.panelEl.querySelectorAll<HTMLInputElement>("[data-house-charge-keep]").forEach((input) => {
    input.onchange = () => {
      const id = input.dataset.houseChargeKeep ?? "";
      const current = state.houseChargesDraftKeep ?? payload.charges.filter((charge) => charge.kept).map((charge) => charge.id);
      state.houseChargesDraftKeep = input.checked ? [...current.filter((entry) => entry !== id), id] : current.filter((entry) => entry !== id);
      deps.rerender();
    };
  });
  const save = deps.panelEl.querySelector<HTMLButtonElement>("[data-house-charges-save]");
  if (save) {
    save.onclick = () => {
      const keptIds = state.houseChargesDraftKeep;
      if (!keptIds) return;
      deps.sendGameMessage({ type: "CHOOSE_HOUSE_CHARGES", keptIds }, "Finish sign-in before choosing your charges.");
    };
  }
  deps.panelEl.querySelectorAll<HTMLButtonElement>("[data-house-charge-jump]").forEach((button) => {
    button.onclick = () => {
      const charge = payload.charges.find((entry) => entry.id === button.dataset.houseChargeJump);
      if (!charge) return;
      const point = houseChargeFocusPoint(charge);
      focusCameraOnTile(state, point.x, point.y, { wrapX: deps.wrapX, wrapY: deps.wrapY, requestViewRefresh: () => deps.requestViewRefresh(2, true) });
      deps.rerender();
    };
  });
};
