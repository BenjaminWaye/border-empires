import { describe, expect, it } from "vitest";

import { ClientMessageSchema } from "../messages/messages.js";
import { OFFER_NOTE_MAX_LENGTH, OFFER_NOTE_REFUSED_MESSAGE, StoredOfferNoteSchema, cleanOfferNote, offerNoteRefusal } from "./diplomacy-offer-notes.js";

// First-15 round 1 owner decision: a short free-text note on truce, alliance and trade offers.
describe("offer notes", () => {
  it("keeps plain text, collapses whitespace and strips markup and control characters", () => {
    expect(cleanOfferNote("  Truce?   We both  grow. ")).toBe("Truce? We both grow.");
    expect(cleanOfferNote("<b>hi</b>\nthere‮")).toBe("b hi /b there");
    expect(cleanOfferNote("   ")).toBeUndefined();
    expect(cleanOfferNote(42)).toBeUndefined();
  });

  it("drops format characters and lone surrogates, keeps emoji joiners, and caps stacked accents", () => {
    expect(cleanOfferNote("a\u200Bb\u2066c\uD800d")).toBe("abcd");
    expect(cleanOfferNote("\u{1F468}\u200D\u{1F469}")).toBe("\u{1F468}\u200D\u{1F469}");
    expect(cleanOfferNote(`e${"\u0301".repeat(40)}`)).toBe(`e${"\u0301".repeat(3)}`);
  });

  it("turns an older client's preset id into its line", () => {
    expect(cleanOfferNote("grow-in-peace")).toBe("Truce while we both grow?");
  });

  it("cuts a long note to the cap without splitting an emoji, so it still fits the stored schema", () => {
    expect(cleanOfferNote("a".repeat(500))).toHaveLength(OFFER_NOTE_MAX_LENGTH);
    const emoji = `${"a".repeat(OFFER_NOTE_MAX_LENGTH - 1)}😀`;
    const cut = cleanOfferNote(emoji)!;
    expect(cut).toBe("a".repeat(OFFER_NOTE_MAX_LENGTH - 1));
    expect(StoredOfferNoteSchema.safeParse(cut).success).toBe(true);
  });

  it("refuses abuse word by word without flagging innocent phrases", () => {
    expect(offerNoteRefusal("you sh1t")).toBe(OFFER_NOTE_REFUSED_MESSAGE);
    expect(offerNoteRefusal("Think of a good deal")).toBeUndefined();
    expect(offerNoteRefusal("you ｓｈｉｔ")).toBe(OFFER_NOTE_REFUSED_MESSAGE);
    expect(offerNoteRefusal("you shït")).toBe(OFFER_NOTE_REFUSED_MESSAGE);
    expect(offerNoteRefusal("you sh\u200Bit")).toBe(OFFER_NOTE_REFUSED_MESSAGE);
    expect(offerNoteRefusal("")).toBeUndefined();
  });

  it("accepts a note on truce, alliance and resource trade requests", () => {
    const terms = { give: { gold: 0, resources: { FOOD: 1 } }, ask: { gold: 0 } };
    for (const message of [
      { type: "TRUCE_REQUEST", targetPlayerName: "Ada", durationHours: 12, note: "Peace?" },
      { type: "ALLIANCE_REQUEST", targetPlayerName: "Ada", note: "Together?" },
      { type: "RESOURCE_TRADE_REQUEST", targetPlayerName: "Ada", terms, note: "Food for you" }
    ]) {
      const parsed = ClientMessageSchema.safeParse(message);
      expect(parsed.success && "note" in parsed.data ? parsed.data.note : undefined).toBe(message.note);
    }
  });
});
