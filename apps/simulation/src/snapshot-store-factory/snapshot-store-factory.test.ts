import { describe, expect, it } from "vitest";

import { createSimulationSnapshotStore } from "./snapshot-store-factory.js";

describe("createSimulationSnapshotStore", () => {
  it("falls back to in-memory snapshot storage when no database url is configured", async () => {
    const store = await createSimulationSnapshotStore();
    expect(store.constructor.name).toBe("InMemorySimulationSnapshotStore");
  });
});
