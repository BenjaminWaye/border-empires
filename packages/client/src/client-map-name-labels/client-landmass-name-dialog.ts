// The one-time "Name this landmass" dialog, opened by
// client-landmass-name-prompt.ts the first time the player garrisons every
// land tile of a landmass ("landmass" is the player-facing word for an
// island). The simulation re-checks the hold and the name (NAME_ISLAND); the
// dialog only pre-checks the name with the same shared rule.
import { validateIslandName } from "@border-empires/shared";

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

const MODAL_ID = "landmass-name-overlay";

export const isLandmassNameDialogOpen = (): boolean => typeof document !== "undefined" && document.getElementById(MODAL_ID) !== null;

export const openLandmassNameDialog = (currentName: string, onSubmit: (name: string) => void): void => {
  document.getElementById(MODAL_ID)?.remove();
  const overlay = document.createElement("div");
  overlay.id = MODAL_ID;
  overlay.style.cssText = "display:grid;position:fixed;inset:0;z-index:9000;place-items:center;";
  overlay.innerHTML = `
  <div class="profile-edit-backdrop" data-landmass-name-cancel></div>
  <div class="profile-edit-modal card" role="dialog" aria-modal="true" aria-labelledby="landmass-name-title">
    <div class="auth-onboarding-head">
      <div id="landmass-name-title" class="auth-panel-title">The whole landmass is yours</div>
      <div class="auth-panel-subtitle">Every acre of ${escapeHtml(currentName || "this landmass")} is garrisoned by your House. Enter a new name for the charts. It stays on the map while you hold most of the land, and fades a day after you lose your grip.</div>
    </div>
    <input class="auth-style-input" type="text" maxlength="28" autocomplete="off" value="${escapeHtml(currentName)}" data-landmass-name-input />
    <div class="auth-panel-subtitle" data-landmass-name-error role="alert"></div>
    <div class="profile-edit-actions">
      <button type="button" class="panel-btn" data-landmass-name-cancel>Keep current name</button>
      <button type="button" class="panel-btn" data-landmass-name-save>Name Landmass</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  const input = overlay.querySelector<HTMLInputElement>("[data-landmass-name-input]")!;
  const error = overlay.querySelector<HTMLElement>("[data-landmass-name-error]")!;
  const close = (): void => overlay.remove();
  const save = (): void => {
    const result = validateIslandName(input.value);
    if (!result.ok) {
      error.textContent = result.reason.charAt(0).toUpperCase() + result.reason.slice(1) + ".";
      return;
    }
    onSubmit(result.name);
    close();
  };
  overlay.querySelectorAll<HTMLElement>("[data-landmass-name-cancel]").forEach((element) => { element.onclick = close; });
  overlay.querySelector<HTMLButtonElement>("[data-landmass-name-save]")!.onclick = save;
  input.onkeydown = (event) => {
    if (event.key === "Enter") save();
    if (event.key === "Escape") close();
  };
  input.focus();
  input.select();
};
