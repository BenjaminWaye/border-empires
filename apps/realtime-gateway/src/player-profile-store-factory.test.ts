import { describe, expect, it } from "vitest";

import { InMemoryGatewayPlayerProfileStore } from "./player-profile-store.js";
import { createGatewayPlayerProfileStore } from "./player-profile-store-factory.js";

describe("createGatewayPlayerProfileStore", () => {
  it("falls back to the in-memory store without a database url", async () => {
    const store = await createGatewayPlayerProfileStore();
    expect(store).toBeInstanceOf(InMemoryGatewayPlayerProfileStore);
  });
});
