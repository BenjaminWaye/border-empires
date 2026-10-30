// Launch Attack on an empire you have a truce or alliance with. Neither pact
// lets you attack, so instead of a doomed attack the button offers to break
// the pact, after a sheet that says what that costs
// (client-break-pact-sheet.ts):
// - truce: breaks at once, then the player can attack.
// - alliance: starts the 24h break notice. Nothing is queued (no attack, no
//   muster flag); the player is told they can attack once the 24h are up.
// A Court armistice cannot be broken, so its attack rows stay disabled.
import { tileActionAvailability } from "../client-tile-action-logic/client-tile-action-availability.js";
import { breakAllianceConsequences, breakTruceConsequences, showBreakPactSheet, type BreakPactSheetOptions } from "../client-break-pact-sheet/client-break-pact-sheet.js";
import type { ClientState } from "../client-state/client-state.js";
import type { ActiveTruceView, FeedSeverity, FeedType, Tile, TileActionDef } from "../client-types.js";

const ATTACK_ROW_IDS: ReadonlyArray<TileActionDef["id"]> = ["launch_attack", "attack_connected_region"];
export const COURT_ARMISTICE_ATTACK_REASON = "Court armistice: no attacks until it ends";
const HOUR_MS = 60 * 60_000;

const hoursLeft = (endsAt: number, nowMs: number): string => `${Math.max(1, Math.ceil((endsAt - nowMs) / HOUR_MS))}h`;

const pendingAllianceBreak = (state: Pick<ClientState, "activeAllianceBreaks">, ownerId: string, nowMs: number) =>
  state.activeAllianceBreaks.find((notice) => notice.otherPlayerId === ownerId && notice.endsAt > nowMs);

/**
 * Rewrites a truced empire's attack rows (in place): enabled, saying the truce
 * must be broken first, or disabled under a Court armistice. Leaves rows
 * alone when there is no truce or spawn protection already blocks them.
 */
export const gateAttackRowsOnTruce = (rows: TileActionDef[], truce: ActiveTruceView | undefined, targetShielded: boolean): void => {
  if (!truce || targetShielded) return;
  for (const [index, row] of rows.entries()) {
    if (!ATTACK_ROW_IDS.includes(row.id)) continue;
    const { loading: _loading, cost: _cost, ...rest } = row;
    rows[index] =
      truce.origin === "court"
        ? { ...rest, detail: "Court armistice", ...tileActionAvailability(false, COURT_ARMISTICE_ATTACK_REASON) }
        : { ...rest, detail: `Truce with ${truce.otherPlayerName}: attacking means breaking it first`, ...tileActionAvailability(true, "") };
  }
};

export const breakTruceAction = (truce: ActiveTruceView): TileActionDef => ({
  id: "break_truce",
  label: "Break Truce",
  ...tileActionAvailability(truce.origin !== "court", "Court armistices cannot be broken", "Locks you out of new truces for 24h")
});

/** Launch Attack on an ally's tile: offers to break the alliance, or says when a pending break ends. */
export const allyLaunchAttackAction = (state: Pick<ClientState, "activeAllianceBreaks">, ownerId: string, nowMs = Date.now()): TileActionDef => {
  const pending = pendingAllianceBreak(state, ownerId, nowMs);
  return pending
    ? { id: "launch_attack", label: "Launch Attack", detail: "Alliance is breaking", ...tileActionAvailability(false, `Alliance ends in ${hoursLeft(pending.endsAt, nowMs)}; attack after that`) }
    : { id: "launch_attack", label: "Launch Attack", detail: "Allied: attacking means breaking the alliance (24h notice)", ...tileActionAvailability(true, "") };
};

export type PactAttackGateDeps = {
  isTileOwnedByAlly: (tile: Tile) => boolean;
  activeTruceWithPlayer: (playerId?: string | null) => ActiveTruceView | undefined;
  playerNameForOwner: (ownerId: string) => string;
  breakTruce: (playerId: string) => void;
  breakAlliance: (playerId: string) => void;
  pushFeed: (message: string, type: FeedType, severity?: FeedSeverity) => void;
  hideTileActionMenu: () => void;
  showSheet?: (options: BreakPactSheetOptions) => boolean;
};

/**
 * Handles Launch Attack / Attack Connected Region on an ally's or truced
 * empire's tile, and Break Truce, by showing the break-pact sheet. Returns
 * false (nothing done) for any other action or target, so the caller
 * launches the attack as usual.
 */
export const dispatchPactGatedAction = (
  actionId: string,
  selected: Tile | undefined,
  state: Pick<ClientState, "me" | "activeAllianceBreaks">,
  deps: PactAttackGateDeps,
  nowMs = Date.now()
): boolean => {
  const ownerId = selected?.ownerId;
  if (!selected || !ownerId || ownerId === state.me || ownerId.startsWith("barbarian")) return false;
  const isAttack = ATTACK_ROW_IDS.includes(actionId as TileActionDef["id"]);
  if (!isAttack && actionId !== "break_truce") return false;
  const showSheet = deps.showSheet ?? showBreakPactSheet;
  if (isAttack && deps.isTileOwnedByAlly(selected)) {
    deps.hideTileActionMenu();
    const name = deps.playerNameForOwner(ownerId);
    const pending = pendingAllianceBreak(state, ownerId, nowMs);
    if (pending) {
      deps.pushFeed(`Your alliance with ${name} is already breaking. You can attack them in ${hoursLeft(pending.endsAt, nowMs)}.`, "alliance", "info");
      return true;
    }
    showSheet({
      title: `Break alliance with ${name}?`,
      subtitle: `${name} is your ally, and allies can't attack each other.`,
      consequences: breakAllianceConsequences(name),
      confirmLabel: "Break Alliance",
      onConfirm: () => {
        deps.breakAlliance(ownerId);
        deps.pushFeed(`Your alliance with ${name} will be broken in 24 hours. You can attack them after that.`, "alliance", "warn");
      }
    });
    return true;
  }
  const truce = deps.activeTruceWithPlayer(ownerId);
  if (!truce) {
    if (!isAttack) deps.breakTruce(ownerId); // Let the gateway say why there is nothing to break.
    return !isAttack;
  }
  deps.hideTileActionMenu();
  if (truce.origin === "court") {
    deps.pushFeed(`${COURT_ARMISTICE_ATTACK_REASON} with ${truce.otherPlayerName}.`, "alliance", "warn");
    return true;
  }
  showSheet({
    title: `Break truce with ${truce.otherPlayerName}?`,
    subtitle: isAttack
      ? `You have a truce with ${truce.otherPlayerName}. To attack them you must break it first.`
      : `Breaking the truce with ${truce.otherPlayerName} has consequences.`,
    consequences: breakTruceConsequences(truce.otherPlayerName),
    confirmLabel: "Break Truce",
    onConfirm: () => deps.breakTruce(ownerId)
  });
  return true;
};
