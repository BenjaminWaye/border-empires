import { describe, expect, it } from "vitest";

import { ClientMessageSchema } from "./messages.js";

describe("ClientMessageSchema", () => {
  it("accepts alliance and truce reject messages", () => {
    expect(ClientMessageSchema.parse({ type: "ALLIANCE_REJECT", requestId: "alliance-1" })).toEqual({
      type: "ALLIANCE_REJECT",
      requestId: "alliance-1"
    });
    expect(ClientMessageSchema.parse({ type: "TRUCE_REJECT", requestId: "truce-1" })).toEqual({
      type: "TRUCE_REJECT",
      requestId: "truce-1"
    });
  });
});
