// What a human's empire did on its own since their last command: coin the
// income tick credited, manpower paid out by refills, and manpower their muster
// flags drew from the pool. Read once by the WELCOME_BACK summary at subscribe
// (welcomeBackSummaryForPlayer) and cleared by the next activity
// (recordPlayerActivity), so it only ever covers one absence.
//
// Bounds (docs/agents/state-and-persistence-discipline.md): one small record
// per player object, held in a WeakMap, so it lives exactly as long as the
// player does and needs no eviction. It is not snapshotted: after a restart it
// starts again from the first credit, and `since` says how much of the absence
// it covers (the summary then estimates coin instead).

export type AwayLedger = {
  /** When this ledger started counting: the last activity, or the first credit after a restart. */
  since: number;
  coin: number;
  manpowerRefilled: number;
  flagsDrawn: number;
};

type LedgerOwner = { isAi?: boolean | undefined };

const ledgers = new WeakMap<LedgerOwner, AwayLedger>();

const ledgerFor = (player: LedgerOwner, nowMs: number): AwayLedger | undefined => {
  // AI houses never come back to a summary, so they keep no ledger.
  if (player.isAi === true) return undefined;
  let ledger = ledgers.get(player);
  if (!ledger) {
    ledger = { since: nowMs, coin: 0, manpowerRefilled: 0, flagsDrawn: 0 };
    ledgers.set(player, ledger);
  }
  return ledger;
};

export const noteAwayCoin = (player: LedgerOwner, amount: number, nowMs: number): void => {
  if (!(amount > 0)) return;
  const ledger = ledgerFor(player, nowMs);
  if (ledger) ledger.coin += amount;
};

export const noteAwayManpowerRefill = (player: LedgerOwner, amount: number, nowMs: number): void => {
  if (!(amount > 0)) return;
  const ledger = ledgerFor(player, nowMs);
  if (ledger) ledger.manpowerRefilled += amount;
};

export const noteAwayFlagDraw = (player: LedgerOwner, amount: number, nowMs: number): void => {
  if (!(amount > 0)) return;
  const ledger = ledgerFor(player, nowMs);
  if (ledger) ledger.flagsDrawn += amount;
};

/** A command or subscribe: the player is back, so the next absence starts counting from now. */
export const resetAwayLedger = (player: LedgerOwner, nowMs: number): void => {
  if (player.isAi === true) return;
  ledgers.set(player, { since: nowMs, coin: 0, manpowerRefilled: 0, flagsDrawn: 0 });
};

export const readAwayLedger = (player: LedgerOwner): Readonly<AwayLedger> | undefined => ledgers.get(player);
