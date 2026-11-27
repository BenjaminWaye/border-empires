import { closestClashingEmpire, tooCloseColorReason, type EmpireColorEntry } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";

// Marks colours in the two empire-colour pickers ("Found your first standard"
// and "Update your empire") that sit too close to a rival's colour
// (MIN_EMPIRE_COLOR_DELTA_E, owner rule 2026-11-27). The gateway refuses
// such picks with the same reason; this only says so before the player saves.

const HEX6 = /^#[0-9a-f]{6}$/;

/** Every other empire's colour the client knows (barbarians are not an empire). */
export const rivalEmpireColors = (state: Pick<ClientState, "me" | "playerColors" | "playerNames">): EmpireColorEntry[] => {
  const rivals: EmpireColorEntry[] = [];
  for (const [playerId, rawColor] of state.playerColors) {
    if (playerId === state.me || playerId.startsWith("barbarian")) continue;
    const color = rawColor.trim().toLowerCase();
    if (HEX6.test(color)) rivals.push({ playerId, name: state.playerNames.get(playerId), color });
  }
  return rivals;
};

/** Why `hex` can't be picked, or undefined when it can. */
export const colorClashReason = (hex: string, rivals: readonly EmpireColorEntry[]): string | undefined => {
  const color = hex.trim().toLowerCase();
  if (!HEX6.test(color)) return undefined;
  const clash = closestClashingEmpire(color, rivals);
  return clash ? tooCloseColorReason(clash.name) : undefined;
};

/** Greys out and labels swatches whose colour is too close to a rival's. */
export const markClashingSwatches = (
  buttons: NodeListOf<HTMLButtonElement> | HTMLButtonElement[],
  rivals: readonly EmpireColorEntry[]
): void => {
  buttons.forEach((btn) => {
    const reason = btn.dataset.color ? colorClashReason(btn.dataset.color, rivals) : undefined;
    btn.disabled = reason !== undefined;
    btn.dataset.tooClose = reason ? "true" : "false";
    if (reason) btn.title = reason;
    else btn.removeAttribute("title");
  });
};

/**
 * Shows the clash reason for the picked colour in `clashEl`. A colour the
 * player already holds (`ownColor`) is never flagged: only new picks are checked.
 */
export const syncColorClashNote = (
  clashEl: HTMLElement | null | undefined,
  color: string,
  rivals: readonly EmpireColorEntry[],
  ownColor?: string
): string | undefined => {
  const unchanged = ownColor !== undefined && ownColor.toLowerCase() === color.toLowerCase();
  const reason = unchanged ? undefined : colorClashReason(color, rivals);
  if (clashEl) {
    clashEl.textContent = reason ?? "";
    clashEl.hidden = reason === undefined;
  }
  return reason;
};
