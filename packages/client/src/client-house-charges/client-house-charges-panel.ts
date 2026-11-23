// The House Charges side panel (docs/house-charges-plan.md, "Player guidance"):
// the House's sealed charges as full-width cards (client-house-charges-deck.ts)
// with whether each is held now, the keep-two choice while it is open
// (client-house-charges-pick.ts), and "Show on map". Opened from the sealed-cards bubble or its docked cards
// (client-house-charges-bubble.ts) and from your own profile's House Charges
// section (client-house-charges-profile.ts).
import { HOUSE_CHARGES_KEPT, WORLD_HEIGHT, WORLD_WIDTH, houseStyledName, type HouseChargeView } from "@border-empires/shared";
import { isTrue3DRendererActive } from "../client-renderer-mode.js";
import type { ClientState } from "../client-state/client-state.js";
import { houseChargeFitView, type HouseChargeFitView } from "./client-house-charges-fit.js";
import { houseChargeUnscoutedHint } from "./client-house-charges-map.js";
import { HOUSE_CHARGES_DRAW_MS, houseChargeDeckCardHtml, houseChargesDeckHtml } from "./client-house-charges-deck.js";
import { foldHouseChargeCards } from "./client-house-charges-fold.js";
import { houseChargesDealing, toggleHouseChargePick } from "./client-house-charges-pick.js";
import { houseChargeGuideCentre } from "./client-house-charges-search-guide.js";
import { houseChargesWithLiveNames } from "./client-house-charges-live-names.js";
import { correctionAfcsInView, correctionGarrisonHint } from "./client-house-charges-correction-afcs.js";
import {
  dismissHouseChargesProfileTip,
  forgetHouseChargesSave,
  houseChargesProfileTipHtml,
  houseChargesProfileTipShown,
  noteHouseChargesSaved,
  requestManageChargesCallout,
  scrollManageChargesIntoView
} from "./client-house-charges-profile-tip.js";


export type HouseChargesPanelDeps = {
  readonly root: ParentNode;
  readonly panelEl: HTMLElement;
  readonly rerender: () => void;
  readonly requestViewRefresh: (priorityBoost?: number, immediate?: boolean) => void;
  readonly sendGameMessage: (payload: unknown, message?: string) => boolean;
  readonly wrapX: (x: number) => number;
  readonly wrapY: (y: number) => number;
  readonly now: () => number;
  /** Closes the panel so the map is in view; the docked cards then offer the way back (client-house-charges-bubble.ts). */
  readonly closePanel: () => void;
  /** The map canvas size, to fit the whole goal on screen. */
  readonly viewport: () => { width: number; height: number };
  /** Which map renderer is drawing; true-3D shows a different amount of map at one zoom. Defaults to the live renderer. */
  readonly renderer?: () => "2d" | "3d";
};

/**
 * Whether the "?" beside the panel title has opened How charges work. It is left out of the panel's HTML, so
 * opening it never rewrites the panel (which would drop keyboard focus and restart a deal), and reapplied after
 * any rewrite. Owner 2026-11-20: nothing sits above the cards unless the player asks for it.
 */
let rewardsOpen = false;

type PanelState = Pick<ClientState, "activePanel" | "houseCharges" | "houseChargesDraftKeep"> &
  Partial<Pick<ClientState, "houseChargeFocusId" | "tiles" | "me" | "activePlayerProfileId" | "playerNames">>;
type CameraState = Pick<ClientState, "camX" | "camY" | "camSubX" | "camSubY" | "zoom">;

/**
 * The view Show on map just framed, so the new HUD can also close a screen the panel sat over (your profile)
 * and put this view back if closing it moved the camera (a close-up glides back to where it began). Read once.
 */
let mapShowRequested: HouseChargeFitView | undefined;
export const takeHouseChargeMapShowRequest = (): HouseChargeFitView | undefined => {
  const requested = mapShowRequested;
  mapShowRequested = undefined;
  return requested;
};

/**
 * "Show on map": highlight the charge, frame the whole goal (both towns of a
 * Charter, not just one) and close the panel so the map can be seen at once.
 * The docked cards then carry a "Back to cards" note (client-house-charges-bubble.ts).
 */
export const showHouseChargeOnMap = (
  state: CameraState & Pick<ClientState, "houseChargeFocusId"> & Partial<Pick<ClientState, "tiles" | "me" | "tilesRevision">>,
  charge: HouseChargeView,
  deps: Pick<HouseChargesPanelDeps, "wrapX" | "wrapY" | "requestViewRefresh" | "closePanel" | "viewport" | "renderer">
): void => {
  const tiles = state.tiles;
  const renderer = deps.renderer?.() ?? (isTrue3DRendererActive() ? "3d" : "2d");
  const found = tiles && state.me ? correctionAfcsInView(charge, { tiles, me: state.me, ...(state.tilesRevision !== undefined ? { tilesRevision: state.tilesRevision } : {}) }) : [];
  const view = houseChargeFitView(charge, (x, y) => tiles?.has(`${x},${y}`) ?? false, deps.viewport(), state.zoom, renderer, found);
  state.houseChargeFocusId = charge.id;
  state.camX = deps.wrapX(view.x);
  state.camY = deps.wrapY(view.y);
  state.camSubX = 0;
  state.camSubY = 0;
  state.zoom = view.zoom;
  mapShowRequested = { x: state.camX, y: state.camY, zoom: view.zoom };
  deps.closePanel();
  deps.requestViewRefresh(2, true);
};

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

/** Why "Keep these" is (or is not) ready, so a greyed button never goes unexplained. */
const choiceHintHtml = (ticked: number, wanted: number): string => {
  const text = ticked > wanted
    ? `You have ${ticked} cards kept. Tap one to set it aside: you can keep only ${wanted}.`
    : ticked < wanted
      ? `Tap ${wanted - ticked} more ${wanted - ticked === 1 ? "card" : "cards"} to keep ${wanted}.`
      : `Press Keep these ${wanted} to confirm your new choice.`;
  return `<p class="house-charges-hint${ticked === wanted ? "" : " is-warning"}" role="status">${text}</p>`;
};

export const houseChargesPanelHtml = (state: PanelState, nowMs: number): string => {
  // A rival House under the name the player knows it by now (client-house-charges-live-names.ts).
  const payload = houseChargesWithLiveNames(state.houseCharges, state.playerNames);
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
  // Only two things show over the cards, as a popover (owner 2026-11-21: an in-flow bar pushed the cards down and
  // cut off their bottoms): an unsaved swap's Keep button, then once it is saved, where to find the charges later.
  // What is kept and until when sits in How charges work, behind the "?" beside the title.
  const choice = choosing && changed
    ? `<div class="house-charges-popover house-charges-choice">
        <div class="house-charges-popover-text">
          <p>Keep ${wanted} of ${payload.charges.length}, until ${until}.</p>
          ${choiceHintHtml(draft.length, wanted)}
        </div>
        <button class="panel-btn" type="button" data-house-charges-save${draft.length === wanted ? "" : " disabled"}>Keep these ${wanted}</button>
      </div>`
    : houseChargesProfileTipShown(payload.dealtAt, kept, changed) ? houseChargesProfileTipHtml() : "";
  const swapWindow = choosing ? `<p class="house-charges-saved">Keeping ${wanted} of ${payload.charges.length}. You can swap until ${until}.</p>` : "";
  const tiles = state.tiles;
  const me = state.me;
  const scoutHintFor = (charge: HouseChargeView): string | undefined =>
    !charge.held && tiles
      ? (me ? correctionGarrisonHint(charge, { tiles, me }, houseStyledName(charge.targets[0]?.name ?? "the rival")) : undefined) ??
        houseChargeUnscoutedHint(charge, (x, y) => tiles.has(`${x},${y}`), WORLD_WIDTH, WORLD_HEIGHT)
      : undefined;
  // While choosing, the cards stay in dealt order so a card does not jump when it is kept or set aside.
  const ordered = choosing ? payload.charges : [...payload.charges].sort((a, b) => Number(b.kept) - Number(a.kept));
  const cards = ordered.map((charge) =>
    houseChargeDeckCardHtml(charge, { choosing, ticked: draft.includes(charge.id), focused: state.houseChargeFocusId === charge.id, scoutHint: scoutHintFor(charge), formatWhen })
  );
  return `<section class="card house-charges-card">
    <div class="house-charges-more" id="house-charges-help" data-house-charges-more hidden>
      ${swapWindow}
      <p>Hold your kept charges when the winner is crowned to bank Domain score.</p>
      <p>Your House sends you sealed charges. Keep ${wanted} of them: to swap, tap Kept on one card to set it aside, then Tap to keep on another. Nobody else can see your charges until the winner is crowned.</p>
      <p>Each kept charge you still hold then earns its charge card and banks Domain score by difficulty: +1 for each ◆, so +1 to +4. Domain score is your House's standing in the galaxy, in the Court's race for Emperor and in your Senate vote.</p>
      <p>◆ is difficulty: how much land the charge needs garrisoned, how far it is from your landing, whether it is over the sea, and how many rival Houses land near it. Harder charges are rarer and pay more.</p>
    </div>
    ${choice}
    ${houseChargesDeckHtml(cards, choosing && houseChargesDealing(payload.dealtAt, nowMs))}
  </section>`;
};

/** Until when each panel's cards are being drawn from the deck (each opening; a first deal has its own, slower draw). */
const drawingUntil = new WeakMap<HTMLElement, number>();

/**
 * Draws the cards from the deck when the panel opens. Kept on the deck for the whole draw, so a rewrite of the panel
 * in the meantime (a pushed update, a Keep tap) carries the draw on rather than snapping the cards to rest.
 */
const syncHouseChargesDraw = (panelEl: HTMLElement, opening: boolean, nowMs: number): void => {
  const deck = panelEl.querySelector<HTMLElement>(".hcd-deck");
  if (!deck || deck.classList.contains("is-dealing")) return;
  if (opening && !(typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) {
    drawingUntil.set(panelEl, nowMs + HOUSE_CHARGES_DRAW_MS);
    window.setTimeout(() => panelEl.querySelector(".hcd-deck")?.classList.remove("is-drawing"), HOUSE_CHARGES_DRAW_MS);
  }
  deck.classList.toggle("is-drawing", nowMs < (drawingUntil.get(panelEl) ?? 0));
};

/** The HTML last written into each panel element. */
const writtenHtml = new WeakMap<HTMLElement, string>();

export const renderHouseChargesPanel = (
  state: PanelState & CameraState & Pick<ClientState, "houseChargeFocusId">,
  deps: HouseChargesPanelDeps
): void => {
  if (state.activePanel !== "charges") {
    if (deps.panelEl.innerHTML !== "") deps.panelEl.innerHTML = "";
    writtenHtml.delete(deps.panelEl);
    dismissHouseChargesProfileTip();
    // Closing the panel closes the help, so reopening it shows the cards with nothing over them.
    rewardsOpen = false;
    return;
  }
  const html = houseChargesPanelHtml(state, deps.now());
  // Compared with what was last written, not innerHTML: the browser rewrites the card art's `<rect/>` as
  // `<rect></rect>`, so an innerHTML check re-rendered every frame (restarting the deal, dropping taps).
  const opening = !writtenHtml.has(deps.panelEl);
  if (writtenHtml.get(deps.panelEl) !== html || !deps.panelEl.firstChild) {
    deps.panelEl.innerHTML = html;
    writtenHtml.set(deps.panelEl, html);
  }
  syncHouseChargesDraw(deps.panelEl, opening, deps.now());
  const more = deps.panelEl.querySelector<HTMLElement>("[data-house-charges-more]");
  const help = deps.root.querySelector<HTMLButtonElement>("#panel-help");
  // The help is a popup over the cards: the "?" toggles it and a tap on it closes it.
  // With no charges dealt yet there is no help to open, so the "?" is hidden (panel-nav only hides it elsewhere).
  if (help && help.hidden !== !more) help.hidden = !more;
  const setHelpOpen = (open: boolean): void => {
    rewardsOpen = open && more !== null;
    if (more && more.hidden !== !rewardsOpen) more.hidden = !rewardsOpen;
    if (help && help.getAttribute("aria-expanded") !== String(rewardsOpen)) help.setAttribute("aria-expanded", String(rewardsOpen));
  };
  setHelpOpen(rewardsOpen);
  if (more) more.onclick = () => setHelpOpen(false);
  if (help) help.onclick = () => setHelpOpen(!rewardsOpen);
  // A rival House under the name the player knows it by now (client-house-charges-live-names.ts).
  const payload = houseChargesWithLiveNames(state.houseCharges, state.playerNames);
  if (!payload) return;
  deps.panelEl.querySelectorAll<HTMLButtonElement>("[data-house-charge-pick]").forEach((card) => {
    card.onclick = () => {
      const current = state.houseChargesDraftKeep ?? payload.charges.filter((charge) => charge.kept).map((charge) => charge.id);
      state.houseChargesDraftKeep = toggleHouseChargePick(current, card.dataset.houseChargePick ?? "");
      deps.rerender();
    };
  });
  const save = deps.panelEl.querySelector<HTMLButtonElement>("[data-house-charges-save]");
  if (save) {
    save.onclick = () => {
      const keptIds = state.houseChargesDraftKeep;
      if (!keptIds) return;
      // Noted before sending: the server's confirmation can arrive (and re-render the panel) before send returns.
      noteHouseChargesSaved(payload.dealtAt, keptIds);
      if (!deps.sendGameMessage({ type: "CHOOSE_HOUSE_CHARGES", keptIds }, "Finish sign-in before choosing your charges.")) forgetHouseChargesSave();
    };
  }
  const tipClose = deps.panelEl.querySelector<HTMLButtonElement>("[data-house-charges-tip-close]");
  if (tipClose) {
    tipClose.onclick = () => {
      dismissHouseChargesProfileTip();
      deps.rerender();
    };
  }
  const tipShow = deps.panelEl.querySelector<HTMLButtonElement>("[data-house-charges-tip-show]");
  if (tipShow) {
    // "Show me": your own profile opens (the HUD turns activePlayerProfileId into the profile screen) with Manage charges glowing.
    tipShow.onclick = () => {
      dismissHouseChargesProfileTip();
      requestManageChargesCallout(deps.now());
      state.activePlayerProfileId = state.me || undefined;
      deps.closePanel();
      deps.rerender();
      scrollManageChargesIntoView(document);
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
      foldHouseChargeCards(deps.panelEl, charge.id);
      showHouseChargeOnMap(state, charge, deps);
      deps.rerender();
    };
  });
};
