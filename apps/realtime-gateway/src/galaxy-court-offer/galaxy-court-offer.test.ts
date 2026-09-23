import { describe, expect, it } from "vitest";
import {
  COURT_PROTECTION_MS,
  MOVE_AGAINST_COURT_LOCK_MS,
  answerCourtOffer,
  initialCourtOffer,
  isCourtProtected,
  isMoveAgainstCourtLocked,
  presentCourtOffer
} from "./galaxy-court-offer.js";

describe("Court offer", () => {
  it("is presented once and only once", () => {
    const pending = presentCourtOffer(initialCourtOffer);
    expect(pending).toEqual({ status: "PENDING" });
    const declined = answerCourtOffer(pending, false, 0);
    expect(presentCourtOffer(declined)).toBe(declined);
  });
  it("declining costs nothing: no protection, no lock", () => {
    const declined = answerCourtOffer({ status: "PENDING" }, false, 5);
    expect(isCourtProtected(declined, 6)).toBe(false);
    expect(isMoveAgainstCourtLocked(declined, 6)).toBe(false);
  });
  it("accepting gives 30 days of protection and a 90-day Move Against the Court lock", () => {
    const accepted = answerCourtOffer({ status: "PENDING" }, true, 1_000);
    expect(isCourtProtected(accepted, 1_000 + COURT_PROTECTION_MS - 1)).toBe(true);
    expect(isCourtProtected(accepted, 1_000 + COURT_PROTECTION_MS)).toBe(false);
    expect(isMoveAgainstCourtLocked(accepted, 1_000 + MOVE_AGAINST_COURT_LOCK_MS - 1)).toBe(true);
    expect(isMoveAgainstCourtLocked(accepted, 1_000 + MOVE_AGAINST_COURT_LOCK_MS)).toBe(false);
  });
  it("can't be answered before it is presented, or answered twice", () => {
    expect(answerCourtOffer(initialCourtOffer, true, 0)).toBe(initialCourtOffer);
    const accepted = answerCourtOffer({ status: "PENDING" }, true, 0);
    expect(answerCourtOffer(accepted, false, 1)).toBe(accepted);
  });
});
