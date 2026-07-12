import type { ClientState } from "../client-state/client-state.js";

// Emperor-endorsement bonus (galaxy meta-layer Phase 1). Charges remaining
// are synced via the player snapshot (INIT/PLAYER_UPDATE); the active
// 10-minute invulnerability window itself arrives as a one-off
// IMPERIAL_WARD_ACTIVATED player message (same convention as Aegis Lock).
export function applyImperialWardActivatedMessage(state: ClientState, msg: Record<string, unknown>): void {
  const activeUntil = msg.activeUntil;
  const chargesRemaining = msg.chargesRemaining;
  if (typeof activeUntil === "number") state.imperialWardActiveUntil = activeUntil;
  if (typeof chargesRemaining === "number") state.imperialWardCharges = chargesRemaining;
}

const formatRemaining = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

// Renders the always-visible stat-chip HTML for the Imperial Ward ability.
// Returns "" when the player has no charges and no active window (nothing to
// show) — mirrors the other conditional chips in client-hud.ts.
export function imperialWardChipHtml(state: Pick<ClientState, "imperialWardCharges" | "imperialWardActiveUntil">): string {
  const now = Date.now();
  const activeUntil = state.imperialWardActiveUntil ?? 0;
  if (activeUntil > now) {
    return `<span class="stat-chip imperial-ward-active" title="Imperial Ward active">🛡️ Warded ${formatRemaining(activeUntil - now)}</span>`;
  }
  const charges = state.imperialWardCharges ?? 0;
  if (charges <= 0) return "";
  return (
    `<button class="stat-chip imperial-ward-activate" type="button" data-imperial-ward-activate ` +
    `title="Imperial Ward: 10 minutes of total invulnerability">🛡️ Imperial Ward (${charges})</button>`
  );
}

export function bindImperialWardChip(hudEl: ParentNode, sendGameMessage: (payload: unknown, message?: string) => boolean): void {
  const button = hudEl.querySelector("[data-imperial-ward-activate]") as HTMLButtonElement | null;
  if (!button) return;
  button.onclick = () => {
    sendGameMessage({ type: "ACTIVATE_IMPERIAL_WARD" }, "Finish sign-in before activating Imperial Ward.");
  };
}
