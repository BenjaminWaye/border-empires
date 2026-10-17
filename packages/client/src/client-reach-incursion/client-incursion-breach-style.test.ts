import { describe, expect, it } from "vitest";
import { DEFAULT_INCURSION_BREACH_STYLE, incursionBreachStyle } from "./client-incursion-breach-style.js";

describe("incursion breach style", () => {
  it("defaults to the front-line spikes for everyone", () => {
    expect(DEFAULT_INCURSION_BREACH_STYLE).toBe("spikes");
    // No URL override or stored admin choice in the test environment.
    expect(incursionBreachStyle()).toBe("spikes");
  });
});
