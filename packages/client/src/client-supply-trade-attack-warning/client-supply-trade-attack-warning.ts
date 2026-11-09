// Attacking a House ends every resource supply trade between the two
// (apps/simulation runtime-frontier-command.ts cancels them when the ATTACK is
// accepted). Launching an attack on a trade partner asks to confirm first
// (client-launch-attack-effort.ts), whatever HUD shows the row; row details,
// the Advance sheet and the March To sheet carry the same line. All text here
// is plain: every renderer escapes it itself.
import type { ClientState } from "../client-state/client-state.js";
import { playerNameForOwnerFromState } from "../client-owner-name/client-owner-name.js";

export type SupplyWarningState = Pick<ClientState, "me" | "meName" | "playerNames" | "leaderboard" | "resourceTradeAgreements">;

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

/** Set Advance picks its own targets later, so it warns whenever the player has any supply trade. */
export const advanceSupplyTradeNote = (state: Pick<ClientState, "resourceTradeAgreements">): string | undefined =>
  state.resourceTradeAgreements.length > 0 ? "Auto-attacks on a House you trade with end those supply trades." : undefined;

/** One warning per distinct attacked House, for the effort sheet's (plain-text) subtitle. */
export const supplyTradeAttackWarningsForTargets = (state: SupplyWarningState, ownerIds: readonly (string | undefined)[]): string | undefined => {
  const lines = [...new Set(ownerIds)].flatMap(id => supplyTradeAttackWarningText(state, id) ?? []);
  return lines.length ? lines.join(". ") : undefined;
};
