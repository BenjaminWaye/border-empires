import { describe, expect, it } from "vitest";

import { InMemorySimulationEventStore } from "./event-store.js";
import { createSimulationEventStore } from "./event-store-factory.js";

describe("createSimulationEventStore", () => {
  it("falls back to the in-memory store without a database url", async () => {
    const store = await createSimulationEventStore();
    expect(store).toBeInstanceOf(InMemorySimulationEventStore);
  });
});
