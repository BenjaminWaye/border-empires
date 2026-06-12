import { describe, expect, it } from "vitest";

import { createSimulationCommandStore } from "./command-store-factory.js";

describe("createSimulationCommandStore", () => {
  it("falls back to in-memory storage when no database url is configured", async () => {
    const store = await createSimulationCommandStore();
    expect(store.constructor.name).toBe("InMemorySimulationCommandStore");
  });
});
