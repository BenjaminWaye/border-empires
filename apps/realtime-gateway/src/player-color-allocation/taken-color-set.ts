import type { EmpireColorEntry, EmpireColorsInUse } from "@border-empires/shared";

/**
 * Colours another empire holds. As a Set it is the exact-hex "taken" list
 * (every stored profile plus the reserved colours), so a colour is never
 * reused outright. `activeEmpires` are the empires still in play (live this
 * process, or active in the last ACTIVE_EMPIRE_WINDOW_MS): a new pick must
 * also stay MIN_EMPIRE_COLOR_DELTA_E away from each of them.
 */
export class TakenColorSet extends Set<string> {
  readonly activeEmpires: EmpireColorEntry[];

  constructor(exact: Iterable<string> = [], activeEmpires: Iterable<EmpireColorEntry> = []) {
    super(exact);
    this.activeEmpires = [...activeEmpires];
  }
}

/** The active empires of `taken`, or none for a plain exact-hex set. */
export const activeEmpiresOf = (taken: ReadonlySet<string>): readonly EmpireColorEntry[] =>
  taken instanceof TakenColorSet ? taken.activeEmpires : [];

// Barbarian grey: an exact-only block. Kept here (not in
// player-color-allocation.ts) so colorsInUseOf has no import cycle.
const RESERVED_EXACT = ["#2f3842"];

/**
 * The colours in use as the shared rule takes them (empireColorRejection):
 * the gateway checks picks against this and sends the same value to the
 * client, so the inline check and the submit check agree.
 */
export const colorsInUseOf = (taken: ReadonlySet<string>): EmpireColorsInUse => ({
  exact: [...new Set([...taken, ...RESERVED_EXACT])],
  empires: activeEmpiresOf(taken)
});
