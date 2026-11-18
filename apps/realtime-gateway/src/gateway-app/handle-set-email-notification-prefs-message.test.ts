import { describe, expect, it } from "vitest";
import { ClientMessageSchema } from "@border-empires/shared";
import { EMAIL_NOTIFICATION_CATEGORIES } from "./handle-set-email-notification-prefs-message.js";

// Regression: SET_EMAIL_NOTIFICATION_PREFS's shared schema strips unknown
// keys, so a category the gateway handles but the schema omits (manpowerFull
// did) was silently dropped and its Settings toggle never persisted.
describe("SET_EMAIL_NOTIFICATION_PREFS schema", () => {
  it("keeps every email notification category the gateway handles", () => {
    const prefs = Object.fromEntries(EMAIL_NOTIFICATION_CATEGORIES.map((category) => [category, false]));
    const parsed = ClientMessageSchema.parse({ type: "SET_EMAIL_NOTIFICATION_PREFS", prefs });
    if (parsed.type !== "SET_EMAIL_NOTIFICATION_PREFS") throw new Error(`unexpected message type ${parsed.type}`);
    expect(parsed.prefs).toEqual(prefs);
  });
});
