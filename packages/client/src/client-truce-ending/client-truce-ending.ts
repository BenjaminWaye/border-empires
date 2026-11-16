// Warning before a truce runs out. Playtest run 2: truces lapsed with no
// notice, so players learned of it from the next attack. Within the last
// TRUCE_ENDING_SOON_MS the Diplomacy list pins the truce with an Extend
// button, its card and deal line say how long is left, and the Activity feed
// plus a popup say so once per truce end (an extension moves the end, so a
// truce that is extended and runs low again warns again).
import type { ActiveTruceView } from "../client-types.js";

export const TRUCE_ENDING_SOON_MS = 2 * 60 * 60_000;

/** Running, and ends within TRUCE_ENDING_SOON_MS. */
export const isTruceEndingSoon = (truce: Pick<ActiveTruceView, "endsAt">, nowMs: number): boolean =>
  truce.endsAt > nowMs && truce.endsAt - nowMs <= TRUCE_ENDING_SOON_MS;

/** Truces ending soon, soonest first. */
export const trucesEndingSoon = <T extends Pick<ActiveTruceView, "endsAt">>(truces: readonly T[], nowMs: number): T[] =>
  truces.filter((truce) => isTruceEndingSoon(truce, nowMs)).sort((a, b) => a.endsAt - b.endsAt);

/** "1h 40m" / "40m": minutes matter in the last two hours, where "2h" hid them. */
export const truceTimeLeftLabel = (endsAt: number, nowMs: number): string => {
  const minutes = Math.max(1, Math.ceil((endsAt - nowMs) / 60_000));
  const hours = Math.floor(minutes / 60);
  if (hours === 0) return `${minutes}m`;
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
};

/** The once-per-end key; `${otherPlayerId}:${endsAt}`, so an extension warns afresh. */
export const truceEndingNoticeKey = (truce: Pick<ActiveTruceView, "otherPlayerId" | "endsAt">): string => `${truce.otherPlayerId}:${truce.endsAt}`;

export type TruceEndingNoticeDeps = {
  /** True the first time this key is seen (persisted per player, so a reload doesn't repeat it). */
  markUnseen: (key: string) => boolean;
  pushFeed: (message: string) => void;
  showAlert: (title: string, detail: string) => void;
};

/** Tells the player once about each truce that just crossed into its last two hours; returns whether any was told. */
export const notifyTrucesEndingSoon = (truces: readonly ActiveTruceView[], nowMs: number, deps: TruceEndingNoticeDeps): boolean => {
  let told = false;
  for (const truce of trucesEndingSoon(truces, nowMs)) {
    if (!deps.markUnseen(truceEndingNoticeKey(truce))) continue;
    const text = `Truce with ${truce.otherPlayerName} ends in ${truceTimeLeftLabel(truce.endsAt, nowMs)}.`;
    deps.pushFeed(text);
    deps.showAlert("Truce ending", text);
    told = true;
  }
  return told;
};
