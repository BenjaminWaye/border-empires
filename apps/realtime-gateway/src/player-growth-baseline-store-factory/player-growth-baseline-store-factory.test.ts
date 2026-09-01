import { describe, expect, it } from "vitest";

import { InMemoryPlayerGrowthBaselineStore } from "../player-growth-baseline-store/player-growth-baseline-store.js";
import { createPlayerGrowthBaselineStore } from "./player-growth-baseline-store-factory.js";

describe("createPlayerGrowthBaselineStore", () => {
  it("falls back to the in-memory store without a database url", async () => {
    const store = await createPlayerGrowthBaselineStore();
    expect(store).toBeInstanceOf(InMemoryPlayerGrowthBaselineStore);
  });
});
