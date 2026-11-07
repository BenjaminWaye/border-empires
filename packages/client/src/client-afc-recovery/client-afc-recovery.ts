import { afcReplacementCost } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import { isValidAfcLandingTile } from "../client-afc-actions.js";
import "./client-afc-recovery.css";

// A single page-owned timer, stopped as soon as the delivery UI closes.
let countdown: { timer: ReturnType<typeof setInterval>; root: HTMLElement; arrivesAt: number } | undefined;
function stopCountdown(): void {
  if (countdown) clearInterval(countdown.timer);
  countdown = undefined;
}
function syncCountdown(root: HTMLElement, arrivesAt: number): void {
  const update = (): void => {
    if (!root.isConnected) { stopCountdown(); return; }
    const label = root.querySelector("[data-afc-countdown]");
    if (label) label.textContent = `${Math.max(0, Math.ceil((arrivesAt - Date.now()) / 1000))}s`;
  };
  update();
  if (countdown?.root === root && countdown.arrivesAt === arrivesAt) return;
  stopCountdown();
  countdown = { root, arrivesAt, timer: setInterval(update, 1000) };
}

export interface AfcRecoveryUiDeps {
  state: ClientState;
  send: (payload: unknown) => boolean;
  rerender: () => void;
  placementOverlayEl: HTMLDivElement;
  placementLabelEl: HTMLDivElement;
}

export const recoveryPopupKey = (state: Pick<ClientState, "afcRecovery">): string =>
  `${state.afcRecovery?.requiredSince}:${state.afcRecovery?.cancellation ?? ""}`;

export function renderAfcRecovery(deps: AfcRecoveryUiDeps): void {
  const { state } = deps;
  let root = document.getElementById("afc-recovery-ui");
  const recovery = state.afcRecovery;
  const required = recovery?.requiredSince !== undefined;
  if (!required || !state.me || !state.authSessionReady || state.needsSeasonJoin) {
    state.afcRecoveryPopupOpen = false;
    stopCountdown();
    root?.remove();
    return;
  }
  if (!root) {
    root = document.createElement("div");
    root.id = "afc-recovery-ui";
    document.body.append(root);
  }
  root.classList.toggle("afc-recovery-ui--modal", Boolean(state.afcRecoveryPopupOpen && !recovery.pending));
  const cost = afcReplacementCost(recovery.globalLosses);
  const pending = recovery.pending;
  const renderKey = `${recoveryPopupKey(state)}:${pending?.commandId ?? ""}:${state.afcRecoveryPopupOpen}:${cost}:${Math.floor(state.gold)}`;
  const unchanged = root.dataset.renderKey === renderKey;
  root.dataset.renderKey = renderKey;
  if (!pending) stopCountdown();
  if (!pending && unchanged) return;
  if (pending) {
    state.afcRecoveryPopupOpen = false;
    if (!unchanged) root.innerHTML = `<div class="afc-recovery-status panel-btn" role="status">AFC inbound · <span data-afc-countdown></span> · (${pending.x}, ${pending.y})</div>`;
    syncCountdown(root, pending.arrivesAt);
    return;
  }
  if (!state.afcRecoveryPopupOpen) {
    root.innerHTML = `<button class="afc-recovery-status panel-btn" type="button">Construction suspended · Call down AFC · ${cost} gold</button>`;
    root.querySelector("button")?.addEventListener("click", () => { state.afcRecoveryPopupOpen = true; deps.rerender(); });
    return;
  }
  const affordable = state.gold >= cost;
  root.innerHTML = `<div class="afc-recovery-shade"></div>
    <section class="afc-recovery-modal" role="dialog" aria-modal="true" aria-labelledby="afc-recovery-title" tabindex="-1">
      <header class="afc-recovery-head">
        <div class="afc-recovery-kicker">House recovery · Fabrication offline</div>
        <h2 id="afc-recovery-title">Your last AFC has been lost</h2>
      </header>
      <div class="afc-recovery-body">
        <p class="afc-recovery-lead">Call down a new AFC to continue construction.</p>
        <p>Until it lands, your AFC provides no gold or manpower. Your surviving forces and other holdings remain operational.</p>
        <p data-afc-cancellation class="afc-recovery-cancellation"></p>
        <div class="afc-recovery-quote">
          <div><span>Replacement cost</span><strong>${cost} gold</strong></div>
          <div><span>Delivery time</span><strong>60 seconds</strong></div>
        </div>
        <p class="afc-recovery-supply">Losses across the planet strain offworld supply. Each further AFC loss adds 10 gold to the replacement price.</p>
        ${affordable ? "" : `<p class="afc-recovery-cancellation">You need ${Math.ceil(cost - state.gold)} more gold. Earn income from surviving holdings, continue fighting, or withdraw and redeploy.</p>`}
      </div>
      <footer class="afc-recovery-footer">
        <div class="afc-recovery-actions">
          <button data-afc-choose class="panel-btn" type="button" ${affordable ? "" : "disabled"}>Choose landing site</button>
          <button data-afc-fight class="panel-btn" type="button">Continue fighting</button>
          <button data-afc-withdraw class="panel-btn" type="button">Withdraw and redeploy</button>
        </div>
        <div data-afc-withdraw-confirm hidden>
          <p>Withdraw from all your territory, leaving buildings behind. Your treasury and fielded manpower reset to the opening package. House knowledge is retained. You receive a fresh landing elsewhere.</p>
          <button data-afc-confirm class="panel-btn" type="button">Confirm withdrawal and redeploy</button>
        </div>
      </footer>
    </section>`;
  const modal = root.querySelector<HTMLElement>("[role=dialog]");
  modal?.focus();
  modal?.addEventListener("keydown", event => {
    event.stopPropagation();
    if (event.key === "Escape") {
      state.afcRecoveryDismissedKey = recoveryPopupKey(state);
      state.afcRecoveryPopupOpen = false;
      deps.rerender();
    }
    if (event.key !== "Tab") return;
    const buttons = Array.from(modal.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")).filter(button => !button.closest("[hidden]"));
    const first = buttons[0];
    const last = buttons.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === modal)) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  const cancellation = root.querySelector("[data-afc-cancellation]");
  if (cancellation) cancellation.textContent = recovery.cancellation ?? "";
  const dismiss = (): void => {
    state.afcRecoveryDismissedKey = recoveryPopupKey(state);
    state.afcRecoveryPopupOpen = false;
  };
  root.querySelector("[data-afc-choose]")?.addEventListener("click", () => {
    const site = [...state.tiles.values()].find(tile => isValidAfcLandingTile(state, tile, true));
    if (!site) {
      if (cancellation) cancellation.textContent = "No clear landing site is visible. Scout or clear owned land, or withdraw and redeploy.";
      return;
    }
    dismiss();
    state.buildingPlacement = { active: true, structureType: "AFC", x: site.x, y: site.y };
    deps.placementOverlayEl.style.display = "flex";
    deps.placementLabelEl.textContent = `Call down AFC · ${cost} gold · choose a tile, then confirm`;
    deps.rerender();
  });
  root.querySelector("[data-afc-fight]")?.addEventListener("click", () => { dismiss(); deps.rerender(); });
  root.querySelector("[data-afc-withdraw]")?.addEventListener("click", () => {
    const confirm = root?.querySelector<HTMLElement>("[data-afc-withdraw-confirm]");
    if (confirm) confirm.hidden = false;
  });
  root.querySelector("[data-afc-confirm]")?.addEventListener("click", () => {
    if (deps.send({ type: "WITHDRAW_AND_REDEPLOY" })) { dismiss(); deps.rerender(); }
  });
}
