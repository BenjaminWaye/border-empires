import { describe, expect, it } from "vitest";

import { InMemoryGatewayCommandStore } from "./command-store.js";
import { createGatewayCommandStore } from "./command-store-factory.js";

describe("createGatewayCommandStore", () => {
  it("falls back to the in-memory store without a database url", async () => {
    const store = await createGatewayCommandStore();
    expect(store).toBeInstanceOf(InMemoryGatewayCommandStore);
  });
});
