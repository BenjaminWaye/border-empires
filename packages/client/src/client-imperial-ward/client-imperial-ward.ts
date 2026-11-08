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

// The HUD's Imperial Ward control: a countdown while warded, an activate button
// while charges remain, nothing otherwise.
export function imperialWardButtonHtml(state: Pick<ClientState, "imperialWardCharges" | "imperialWardActiveUntil">, now: number = Date.now()): string {
  const activeUntil = state.imperialWardActiveUntil ?? 0;
  if (activeUntil > now) {
    return `<span class="hud-v2-ward imperial-ward-active" title="Imperial Ward active">⛨ Warded ${formatRemaining(activeUntil - now)}</span>`;
  }
  const charges = state.imperialWardCharges ?? 0;
  if (charges <= 0) return "";
  return (
    `<button class="hud-v2-ward imperial-ward-activate" type="button" data-imperial-ward-activate ` +
    `title="Imperial Ward: 10 minutes of total invulnerability">⛨ Imperial Ward (${charges})</button>`
  );
}

export function activateImperialWard(sendGameMessage: (payload: unknown, message?: string) => boolean): void {
  sendGameMessage({ type: "ACTIVATE_IMPERIAL_WARD" }, "Finish sign-in before activating Imperial Ward.");
}
