import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileMenuProgressView } from "../client-types.js";
import { playerDisplayNameForOwnerFromState } from "../client-owner-name/client-owner-name.js";
import { battleOddsDetail, battleOddsView, liveBattleOdds, type LiveWinChance } from "./client-battle-odds.js";

/** Mirror the battle sources used by both map renderers when no manual
 * capture is selected: muster attacks and the resolved combat animation. */
export const trackedBattleProgressView = (
  state: Pick<ClientState, "outgoingMusterAttacksByTile" | "activeBattles" | "playerNames" | "playerColors" | "leaderboard" | "me" | "meName">,
  tile: Tile,
  formatCountdownClock: (ms: number) => string,
  nowMs = Date.now(),
  liveWinChance?: LiveWinChance
): TileMenuProgressView | undefined => {
  if (tile.fogged) return undefined;
  const key = `${tile.x},${tile.y}`;
  const outgoing = state.outgoingMusterAttacksByTile?.get(key);
  if (outgoing && !outgoing.isExpand && outgoing.resolvesAt > nowMs) {
    const startAt = outgoing.transitEndsAt ?? outgoing.resolvesAt - 3_000;
    // Prefer the odds the server locked in when it accepted the attack; the
    // live preview is only a fallback (e.g. after a reconnect lost them).
    const odds = tile.ownerId && typeof outgoing.winChance === "number"
      ? battleOddsView(state, tile.ownerId, outgoing.winChance)
      : liveBattleOdds(state, tile, liveWinChance);
    return {
      title: "Battle in progress",
      detail: odds ? battleOddsDetail(odds) : "Your muster forces are attacking this tile. The outcome resolves when the timer ends.",
      remainingLabel: formatCountdownClock(outgoing.resolvesAt - nowMs),
      progress: Math.max(0, Math.min(1, (nowMs - startAt) / Math.max(1, outgoing.resolvesAt - startAt))),
      note: "The fight was already rolled when the attack launched; the result shows when the timer ends.",
      ...(odds ? { battle: odds } : {})
    };
  }
  const battle = state.activeBattles?.get(key);
  if (!battle || battle.endAt <= nowMs) return undefined;
  const winnerId = battle.attackerWon ? battle.attackerOwnerId : battle.defenderOwnerId;
  const winner = winnerId === state.me ? "You won" : `${playerDisplayNameForOwnerFromState(state, winnerId) ?? "The winning empire"} won`;
  return {
    title: "Battle resolved",
    detail: `${winner} this battle. The combat animation is finishing on the map.`,
    remainingLabel: formatCountdownClock(battle.endAt - nowMs),
    progress: 1,
    note: "The result is final; the remaining timer is only the map animation."
  };
};

const battleTitles = ["Battle in progress", "Under attack", "Battle resolved", "Attack incoming", "Being captured"];

const isObject = (value: unknown): value is { [key: string]: unknown } =>
  typeof value === "object" && value !== null;

/** Detect battle text already on screen even if map FX expired before the first tick. */
export const hasRenderedBattleStatus = (signature: string): boolean => {
  try {
    const view: unknown = JSON.parse(signature);
    if (!isObject(view)) return false;
    if (typeof view.statusText === "string" && battleTitles.includes(view.statusText)) return true;
    if (isObject(view.progress) && typeof view.progress.title === "string" && battleTitles.includes(view.progress.title)) return true;
    return Array.isArray(view.overviewLines) && view.overviewLines.some((line: unknown) =>
      isObject(line) && typeof line.html === "string" && battleTitles.includes(line.html));
  } catch {
    return false;
  }
};

/** Keep battle information visible when the player opens the Overview tab. */
export const battleOverviewLines = (progress: TileMenuProgressView | undefined): { html: string }[] => {
  if (!progress || !battleTitles.includes(progress.title)) return [];
  const escape = (value: string): string => value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  return [
    { html: progress.title },
    { html: `${escape(progress.detail)} (${escape(progress.remainingLabel)})` }
  ];
};


export const battleMenuHeaderStatus = (progress: TileMenuProgressView | undefined): { text: string; tone: "neutral" | "warning" } | undefined => {
  if (!progress || !battleTitles.includes(progress.title)) return undefined;
  return { text: progress.title, tone: progress.title === "Battle resolved" ? "neutral" : "warning" };
};
