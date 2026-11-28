import { describe, expect, it } from "vitest";
import { ClientMessageSchema } from "@border-empires/shared";
import { offerNoteError, offerOptionsFor } from "./diplomacy-offer-options.js";

// First-15 round 1 owner decision: truce and alliance offers carry a short free-text note (they took preset
// ids only before; an older client's id still reads as its line).
describe("offer notes", () => {
  it("cleans a free-text note into the stored offer and maps an older client's preset id to its line", () => {
    expect(offerOptionsFor({ note: "  Let's <b>talk</b>\n" })).toEqual({ note: "Let's b talk /b" });
    expect(offerOptionsFor({ note: "common-enemy" })).toEqual({ note: "Join me against our common enemy?" });
    expect(offerOptionsFor({ note: "   " })).toEqual({});
    expect(offerOptionsFor({})).toEqual({});
  });

  it("refuses an abusive note and lets a clean one through", () => {
    expect(offerNoteError({ note: "f.u.c.k off" })).toEqual(expect.objectContaining({ ok: false, code: "OFFER_NOTE_REFUSED" }));
    expect(offerNoteError({ note: "Peace for now?" })).toBeUndefined();
  });

  it("accepts free text on TRUCE_REQUEST and ALLIANCE_REQUEST", () => {
    expect(ClientMessageSchema.safeParse({ type: "TRUCE_REQUEST", targetPlayerName: "Tove", durationHours: 12, note: "Peace?" }).success).toBe(true);
    expect(ClientMessageSchema.safeParse({ type: "ALLIANCE_REQUEST", targetPlayerName: "Tove", note: "free text from a player" }).success).toBe(true);
  });
});
