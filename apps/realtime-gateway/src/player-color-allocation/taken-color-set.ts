import type { EmpireColorEntry } from "@border-empires/shared";

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
