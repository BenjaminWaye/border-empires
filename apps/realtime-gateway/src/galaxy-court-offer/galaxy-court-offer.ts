// §21.10: the Court's one-time, optional offer to a new Duke -- 30 days of
// Court protection (Warden Incursions suppressed) in exchange for a 90-day
// lock on Move Against the Court. Shown once, ever; declining costs nothing.
// Pure state machine -- not yet wired to routes.
const DAY_MS = 24 * 60 * 60 * 1000;
export const COURT_PROTECTION_MS = 30 * DAY_MS;
export const MOVE_AGAINST_COURT_LOCK_MS = 90 * DAY_MS;

export type CourtOfferState =
  | { status: "NOT_OFFERED" }
  | { status: "PENDING" }
  | { status: "DECLINED" }
  | { status: "ACCEPTED"; acceptedAt: number };

export const initialCourtOffer: CourtOfferState = { status: "NOT_OFFERED" };

export const presentCourtOffer = (state: CourtOfferState): CourtOfferState =>
  state.status === "NOT_OFFERED" ? { status: "PENDING" } : state;

export const answerCourtOffer = (state: CourtOfferState, accept: boolean, now: number): CourtOfferState => {
  if (state.status !== "PENDING") return state;
  return accept ? { status: "ACCEPTED", acceptedAt: now } : { status: "DECLINED" };
};

export const isCourtProtected = (state: CourtOfferState, now: number): boolean =>
  state.status === "ACCEPTED" && now < state.acceptedAt + COURT_PROTECTION_MS;

export const isMoveAgainstCourtLocked = (state: CourtOfferState, now: number): boolean =>
  state.status === "ACCEPTED" && now < state.acceptedAt + MOVE_AGAINST_COURT_LOCK_MS;
