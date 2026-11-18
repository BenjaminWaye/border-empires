// The House Charges side panel (docs/house-charges-plan.md, "Player guidance"):
// the House's sealed charges, whether each is held now, the keep-two choice
// while it is open, and "Show on map". Opened from the House Charges section of
// your own profile (client-house-charges-profile.ts).
import { HOUSE_CHARGES_KEPT, WORLD_HEIGHT, WORLD_WIDTH, type HouseChargeView } from "@border-empires/shared";
import { focusCameraOnTile } from "../client-activity-dashboard/client-activity-dashboard-center.js";
import type { ClientState } from "../client-state/client-state.js";
import { houseChargeUnscoutedHint } from "./client-house-charges-map.js";
import { houseChargeGuideCentre } from "./client-house-charges-search-guide.js";
import { HOUSE_CHARGE_KIND_LABEL, HOUSE_CHARGE_RARITY_LABEL, houseChargeLetter, houseChargeObjective, houseChargeProgress } from "./client-house-charges-labels.js";

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

type PanelState = Pick<ClientState, "activePanel" | "houseCharges" | "houseChargesDraftKeep"> & Partial<Pick<ClientState, "houseChargeFocusId" | "tiles">>;

const escapeHtml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const formatWhen = (epochMs: number): string =>
  new Date(epochMs).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Where "Show on map" goes: a target the player has explored, otherwise the
 * middle of the rough circles the map draws (client-house-charges-search-guide.ts),
 * so the camera lands on what is shown and never on an unscouted town itself.
 * Area charges centre on their region. Without `isExplored` (no tile
 * knowledge) the first target is used.
 */
export const houseChargeFocusPoint = (charge: HouseChargeView, isExplored?: (x: number, y: number) => boolean): { x: number; y: number } => {
  if (charge.areaTileKeys || !isExplored) return charge.targets[0] ?? charge.searchCircle;
  return charge.targets.find((target) => isExplored(target.x, target.y)) ?? houseChargeGuideCentre(charge, isExplored, WORLD_WIDTH, WORLD_HEIGHT) ?? charge.searchCircle;
};

const letterHtml = (charge: HouseChargeView): string => {
  const letter = houseChargeLetter(charge);
  return letter ? `<p class="house-charge-letter">${escapeHtml(letter)}</p>` : "";
};

const chargeCardHtml = (charge: HouseChargeView, choosing: boolean, ticked: boolean, focused: boolean, scoutHint: string | undefined): string => {
  const progress = houseChargeProgress(charge);
  // While choosing, the card follows the tick boxes so a swap reads at a glance before it is saved.
  const pending = choosing && ticked !== charge.kept;
  const status = pending
    ? `<span class="house-charge-status is-pending">${ticked ? "Will be kept" : "Will be dropped"}</span>`
    : !charge.kept && !choosing
    ? '<span class="house-charge-status is-dropped">Not kept</span>'
    : charge.held
      ? `<span class="house-charge-status is-held">Held${charge.completeSince ? ` since ${escapeHtml(formatWhen(charge.completeSince))}` : ""}</span>`
      : charge.kept
        ? charge.lostAt !== undefined
          ? `<span class="house-charge-status is-lost">Lost ${escapeHtml(formatWhen(charge.lostAt))}</span>`
          : '<span class="house-charge-status">Not held</span>'
        : "";
  // `renown` is set from the charge's difficulty when it is dealt (distance, size, tier); shown as difficulty.
  const difficulty = Math.max(1, Math.min(4, charge.renown));
  const pips = `<span class="house-charge-pips" title="Difficulty ${difficulty} of 4" aria-label="Difficulty ${difficulty} of 4">${"◆".repeat(difficulty)}</span>`;
  const keep = choosing
    ? `<label class="house-charge-keep"><input type="checkbox" data-house-charge-keep="${escapeHtml(charge.id)}"${ticked ? " checked" : ""}> Keep</label>`
    : "";
  const dimmed = choosing ? !ticked : !charge.kept;
  return `<article class="house-charge-card kind-${charge.kind.toLowerCase()} rarity-${charge.rarity.toLowerCase()}${dimmed ? " is-unkept" : ""}">
    <header class="house-charge-head"><strong class="house-charge-title">${escapeHtml(charge.title)}</strong>${pips}</header>
    <div class="house-charge-type">${HOUSE_CHARGE_KIND_LABEL[charge.kind]} · ${HOUSE_CHARGE_RARITY_LABEL[charge.rarity]}</div>
    <p class="house-charge-objective">${escapeHtml(houseChargeObjective(charge))}</p>
    ${letterHtml(charge)}
    ${progress ? `<p class="house-charge-progress">${escapeHtml(progress)}</p>` : ""}
    ${scoutHint ? `<p class="house-charge-progress is-scout">${escapeHtml(scoutHint)}</p>` : ""}
    <footer class="house-charge-foot">${status}${keep}<button class="panel-btn${focused ? " is-active" : ""}" type="button" data-house-charge-jump="${escapeHtml(charge.id)}" aria-pressed="${focused}">${focused ? "Hide on map" : "Show on map"}</button></footer>
  </article>`;
};

/** Why "Keep these" is (or is not) ready, so a greyed button never goes unexplained. */
const choiceHintHtml = (ticked: number, wanted: number): string => {
  const text = ticked > wanted
    ? `You have ${ticked} ticked. Untick one: you can keep only ${wanted}.`
    : ticked < wanted
      ? `Tick ${wanted - ticked} more to keep ${wanted}.`
      : `Press Keep these ${wanted} to confirm your new choice.`;
  return `<p class="house-charges-hint${ticked === wanted ? "" : " is-warning"}" role="status">${text}</p>`;
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
  const until = escapeHtml(formatWhen(payload.choiceClosesAt));
  // With nothing to save (the ticks match what the server keeps, which may be the default pair), say what is
  // kept and how to swap instead of a disabled button that reads as an unsaved choice. Deliberately no "saved"
  // tick: the default pair is kept without the player ever choosing.
  const choice = !choosing
    ? ""
    : changed
      ? `<div class="house-charges-choice">
        <p>Keep ${wanted} of these ${payload.charges.length}. You can change your choice until ${until}.</p>
        ${choiceHintHtml(draft.length, wanted)}
        <button class="panel-btn" type="button" data-house-charges-save${draft.length === wanted ? "" : " disabled"}>Keep these ${wanted}</button>
      </div>`
      : `<div class="house-charges-choice is-saved">
        <p class="house-charges-saved" role="status">Keeping the ${wanted} ticked of these ${payload.charges.length}. Tick another to swap, until ${until}.</p>
      </div>`;
  const tiles = state.tiles;
  const scoutHintFor = (charge: HouseChargeView): string | undefined =>
    !charge.held && tiles ? houseChargeUnscoutedHint(charge, (x, y) => tiles.has(`${x},${y}`), WORLD_WIDTH, WORLD_HEIGHT) : undefined;
  const ordered = [...payload.charges].sort((a, b) => Number(b.kept) - Number(a.kept));
  return `<section class="card house-charges-card">
    <p class="house-charges-intro">Sealed charges from your House. Hold a kept charge when this Sector Contest's winner is crowned to earn its charge card and a galaxy reward. ◆ is difficulty. Nobody else can see your charges until then.</p>
    ${choice}
    <div class="house-charges-list">${ordered.map((charge) => chargeCardHtml(charge, choosing, draft.includes(charge.id), state.houseChargeFocusId === charge.id, scoutHintFor(charge))).join("")}</div>
  </section>`;
};

export const renderHouseChargesPanel = (
  state: PanelState & Pick<ClientState, "camX" | "camY" | "camSubX" | "camSubY" | "selected" | "houseChargeFocusId">,
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
      // A second press hides the highlight again; the map overlays read houseChargeFocusId every frame.
      if (state.houseChargeFocusId === charge.id) {
        state.houseChargeFocusId = undefined;
        deps.requestViewRefresh(2, true);
        deps.rerender();
        return;
      }
      state.houseChargeFocusId = charge.id;
      const tiles = state.tiles;
      const point = houseChargeFocusPoint(charge, tiles ? (x, y) => tiles.has(`${x},${y}`) : undefined);
      focusCameraOnTile(state, point.x, point.y, { wrapX: deps.wrapX, wrapY: deps.wrapY, requestViewRefresh: () => deps.requestViewRefresh(2, true) });
      deps.rerender();
    };
  });
};
