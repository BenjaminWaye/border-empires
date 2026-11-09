// Attacking a House ends every resource supply trade between the two
// (apps/simulation runtime-frontier-command.ts cancels them when the ATTACK is
// accepted). The tile menu's attack rows warn about it beforehand.
import type { ClientState } from "../client-state/client-state.js";
import { playerNameForOwnerFromState } from "../client-owner-name/client-owner-name.js";

type SupplyWarningState = Pick<ClientState, "me" | "meName" | "playerNames" | "leaderboard" | "resourceTradeAgreements">;

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);

/** Active supply agreements between the player and `ownerId`, either direction. */
export const supplyTradeCountWithOwner = (state: Pick<ClientState, "me" | "resourceTradeAgreements">, ownerId: string): number =>
  state.resourceTradeAgreements.filter(row =>
    (row.proposerId === state.me && row.targetId === ownerId) || (row.proposerId === ownerId && row.targetId === state.me)).length;

/** Plain text "Attacking ends your 2 supply trades with House X", or undefined when there are none (or the owner is a barbarian). */
export const supplyTradeAttackWarningText = (state: SupplyWarningState, ownerId: string | null | undefined): string | undefined => {
  if (!ownerId || ownerId === state.me || ownerId.startsWith("barbarian")) return undefined;
  const count = supplyTradeCountWithOwner(state, ownerId);
  if (!count) return undefined;
  const name = playerNameForOwnerFromState(state, ownerId) ?? "them";
  return `Attacking ends your ${count} supply trade${count === 1 ? "" : "s"} with ${name}`;
};

/** HTML-escaped form for tile-menu row details, which render as markup. */
export const supplyTradeAttackWarning = (state: SupplyWarningState, ownerId: string | null | undefined): string | undefined => {
  const text = supplyTradeAttackWarningText(state, ownerId);
  return text === undefined ? undefined : escapeHtml(text);
};

/** One warning per distinct attacked House, for the effort sheet's (plain-text) subtitle. */
export const supplyTradeAttackWarningsForTargets = (state: SupplyWarningState, ownerIds: readonly (string | undefined)[]): string | undefined => {
  const lines = [...new Set(ownerIds)].flatMap(id => supplyTradeAttackWarningText(state, id) ?? []);
  return lines.length ? lines.join(". ") : undefined;
};
