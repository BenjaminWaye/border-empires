// The muster flag's Attack commitment card (docs/replenishment-update-plan.md D6): its markup and wiring,
// shared by the legacy tile menu's Attack tab and the new HUD's Attack commitment sidebar. Slider drags and
// presets only patch the value/odds text in place; only Save writes anything (SET_MUSTER), which then
// re-renders through the resulting tile delta.

import { applyOddsScale, commitOddsMultiplier } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import { advanceCommitOddsText, type MusterCommitView } from "./client-muster-commit-tab.js";

const commitOddsText = (commit: MusterCommitView): string =>
  commit.winChancePercent != null
    ? `${commit.winChancePercent}% win chance`
    : commit.mode === "ADVANCE"
      ? advanceCommitOddsText(commit.commitManpower, commit.floor)
      : commit.hasTarget
        ? "Win chance unavailable — open Launch Attack on the target tile once to preview odds"
        : "Set a march target to preview odds";

/** `idPrefix` keeps the slider's id unique when the legacy menu and the sidebar both hold a card. */
export const musterCommitCardHtml = (commit: MusterCommitView | undefined, idPrefix = "muster-commit"): string => {
  if (!commit) return `<div class="tile-menu-empty">No muster flag here.</div>`;
  const id = `${idPrefix}-slider`;
  return `
      <div class="muster-commit-card">
        <div class="muster-commit-row">
          <label for="${id}">Commit manpower</label>
          <input id="${id}" type="range" min="${commit.floor}" max="${commit.cap}" step="1" value="${commit.commitManpower}" data-muster-commit-slider data-muster-commit-floor="${commit.floor}" data-muster-commit-base-odds="${commit.baseWinChancePercent ?? ""}"${commit.mode === "ADVANCE" ? " data-muster-commit-advance" : ""} />
          <span class="muster-commit-value" data-muster-commit-value>${commit.commitManpower}</span>
        </div>
        <div class="muster-commit-presets">
          ${commit.presets.map((preset) => `<button type="button" class="muster-commit-preset-btn" data-muster-commit-preset="${preset.amount}">${preset.label} (${preset.amount})</button>`).join("")}
        </div>
        <div class="muster-commit-odds" data-muster-commit-odds>${commitOddsText(commit)}</div>
        <button type="button" class="muster-commit-save-btn" data-muster-commit-save>Save commitment</button>
      </div>
    `;
};

/** A value the player picked but hasn't saved yet; a repaint of the card must not throw it away. */
export const unsavedMusterCommitValue = (root: ParentNode): string | undefined => {
  const slider = root.querySelector<HTMLInputElement>("[data-muster-commit-slider]");
  return slider?.dataset.musterCommitDirty ? slider.value : undefined;
};

export type MusterCommitWiring = {
  state: Pick<ClientState, "tileActionMenu" | "tiles">;
  sendGameMessage: (payload: unknown) => boolean;
  /** An unsaved pick from before a repaint (unsavedMusterCommitValue). */
  restoreValue?: string | undefined;
};

export const wireMusterCommitCard = (root: ParentNode, wiring: MusterCommitWiring): void => {
  const slider = root.querySelector<HTMLInputElement>("[data-muster-commit-slider]");
  if (!slider) return;
  const valueEl = root.querySelector<HTMLElement>("[data-muster-commit-value]");
  const oddsEl = root.querySelector<HTMLElement>("[data-muster-commit-odds]");
  const floor = Number(slider.dataset.musterCommitFloor ?? slider.min);
  const baseOddsRaw = slider.dataset.musterCommitBaseOdds;
  const baseOddsPercent = baseOddsRaw ? Number(baseOddsRaw) : undefined;
  const updatePreview = (): void => {
    const value = Number(slider.value);
    if (valueEl) valueEl.textContent = String(value);
    if (oddsEl && baseOddsPercent != null && floor > 0) {
      const pct = Math.max(0, Math.min(100, Math.round(applyOddsScale(baseOddsPercent / 100, commitOddsMultiplier(value, floor)) * 100)));
      oddsEl.textContent = `${pct}% win chance`;
    } else if (oddsEl && slider.hasAttribute("data-muster-commit-advance") && floor > 0) {
      oddsEl.textContent = advanceCommitOddsText(value, floor);
    }
  };
  const pick = (value: string): void => {
    slider.value = value;
    slider.dataset.musterCommitDirty = "1";
    updatePreview();
  };
  slider.oninput = () => pick(slider.value);
  if (wiring.restoreValue !== undefined) pick(wiring.restoreValue);
  root.querySelectorAll<HTMLButtonElement>("button[data-muster-commit-preset]").forEach((btn) => {
    btn.onclick = () => {
      const amount = Number(btn.dataset.musterCommitPreset);
      if (Number.isFinite(amount)) pick(String(amount));
    };
  });
  const saveBtn = root.querySelector<HTMLButtonElement>("[data-muster-commit-save]");
  if (!saveBtn) return;
  saveBtn.onclick = () => {
    const { state } = wiring;
    const tile = state.tileActionMenu.currentTileKey ? state.tiles.get(state.tileActionMenu.currentTileKey) : undefined;
    if (!tile?.muster) return;
    wiring.sendGameMessage({
      type: "SET_MUSTER",
      x: tile.x,
      y: tile.y,
      mode: tile.muster.mode,
      ...(tile.muster.targetX != null ? { targetX: tile.muster.targetX } : {}),
      ...(tile.muster.targetY != null ? { targetY: tile.muster.targetY } : {}),
      // A SET_MUSTER without hunt ends a Planetary Defense hunt, so a commitment change must resend it
      // or the flag turns into a plain ADVANCE that attacks any rival in range.
      ...(tile.muster.hunt ? { hunt: true } : {}),
      commitManpower: Number(slider.value)
    });
    delete slider.dataset.musterCommitDirty;
  };
};
