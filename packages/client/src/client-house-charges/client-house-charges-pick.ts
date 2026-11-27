// The keep choice (owner 2026-11-19: "pick between cards"). While the choice is
// open, the Charges panel deals the House's charges as cards
// (client-house-charges-deck.ts) that slide in one by one the first time the
// panel is opened for a deal; each card's Keep button keeps it or sets it aside.
// A tap only keeps or sets aside that card: with a full hand the player sets one
// aside first (a third kept card disables saving, and the hint says so); an
// automatic swap would drop an arbitrary card of a default pair nobody picked.

const DEAL_KEY = "be.houseCharges.pickDealt";
/** Long enough for the last card's deal (0.25 s apart, 0.5 s each) to finish before the class goes. */
export const HOUSE_CHARGES_DEAL_MS = 1_600;

/** When this deal's cards started turning over in this session; read from storage once per deal. */
let dealing: { dealtAt: number; startedAt: number | null } | undefined;

const readDealt = (): string | null => {
  try {
    return window.localStorage.getItem(DEAL_KEY);
  } catch {
    return null;
  }
};

const writeDealt = (dealtAt: number): void => {
  try {
    window.localStorage.setItem(DEAL_KEY, String(dealtAt));
  } catch {
    // Storage blocked: the cards may be dealt again after a reload, which is harmless.
  }
};

/** True while the deal's cards are turning over. The first call for an unseen deal starts the turn. */
export const houseChargesDealing = (dealtAt: number, nowMs: number): boolean => {
  if (dealing?.dealtAt !== dealtAt) {
    const seen = readDealt() === String(dealtAt);
    dealing = { dealtAt, startedAt: seen ? null : nowMs };
    if (!seen) writeDealt(dealtAt);
  }
  return dealing.startedAt !== null && nowMs - dealing.startedAt < HOUSE_CHARGES_DEAL_MS;
};

/** Test-only: forgets which deals were turned over in this session. */
export const resetHouseChargesPickForTests = (): void => {
  dealing = undefined;
};

/** The draft after a tap on `id`: set aside if kept, else kept. */
export const toggleHouseChargePick = (draft: readonly string[], id: string): string[] =>
  draft.includes(id) ? draft.filter((entry) => entry !== id) : [...draft, id];
