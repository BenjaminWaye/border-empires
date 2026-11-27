// Client half of the simulation's WELCOME_BACK message (sent once per visit by
// SubscribePlayer, apps/simulation/src/runtime-passive-income.ts
// welcomeBackSummaryForPlayer): what the empire did on its own while the player
// was away. Coin kept arriving the whole time, so on return the treasury had
// jumped far past the listed rate with nothing saying why (Playtest Run 5).
// The Chronicle's "Since you last looked" card folds it in as one line.
//
// Held here rather than on ClientState (at its 500-line budget): one summary,
// replaced by each newer one, so nothing grows.

export type WelcomeBackSummary = {
  elapsedMs: number;
  goldEarned: number;
  manpowerRefilled: number;
  flagsDrawn: number;
  incomeCapped: boolean;
  /** Server time the summary was made; a replayed copy carries the same value. */
  at: number;
};

let latest: WelcomeBackSummary | undefined;

const num = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0);

/** Parses and keeps a WELCOME_BACK message. False when it is malformed or not newer than the one held. */
export const applyWelcomeBackMessage = (msg: Record<string, unknown>, receivedAt = Date.now()): boolean => {
  if (msg.type !== "WELCOME_BACK" || typeof msg.elapsedMs !== "number") return false;
  // Older servers sent no `at`: stamp the arrival time instead.
  const at = typeof msg.at === "number" && Number.isFinite(msg.at) ? msg.at : receivedAt;
  if (latest && at <= latest.at) return false;
  latest = {
    elapsedMs: num(msg.elapsedMs),
    goldEarned: num(msg.goldEarned),
    manpowerRefilled: num(msg.manpowerRefilled),
    flagsDrawn: num(msg.flagsDrawn),
    incomeCapped: msg.incomeCapped === true,
    at
  };
  return true;
};

export const latestWelcomeBack = (): WelcomeBackSummary | undefined => latest;

/** Test seam. */
export const resetWelcomeBack = (): void => {
  latest = undefined;
};

/** "45m", "9h", "2d 3h". */
export const awayDurationText = (ms: number): string => {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest > 0 ? `${days}d ${rest}h` : `${days}d`;
};

const count = (n: number): string => Math.floor(n).toLocaleString("en-US");

/**
 * The card's lines: what came in while away, then a note when coin stopped at
 * the 24h limit. None when nothing came in and nothing was capped.
 */
export const welcomeBackLines = (summary: WelcomeBackSummary | undefined): string[] => {
  if (!summary) return [];
  const parts: string[] = [];
  if (summary.goldEarned >= 1) parts.push(`+${count(summary.goldEarned)} coin`);
  if (summary.manpowerRefilled >= 1) parts.push(`+${count(summary.manpowerRefilled)} manpower`);
  if (summary.flagsDrawn >= 1) parts.push(`${count(summary.flagsDrawn)} manpower to flags`);
  const lines: string[] = [];
  if (parts.length > 0) lines.push(`Away ${awayDurationText(summary.elapsedMs)}: ${parts.join(" · ")}.`);
  if (summary.incomeCapped) lines.push("Coin stopped after 24h away.");
  return lines;
};
