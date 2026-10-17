import { describe, expect, it } from "vitest";

import { pickLocatorSlots } from "./client-persistent-alert-locator-slots.js";

const isHostile = (id: string): boolean => id.startsWith("h");

describe("pickLocatorSlots", () => {
  it("puts priority candidates first, up to the reserved count", () => {
    expect(pickLocatorSlots(["own1", "own2", "h1", "own3"], isHostile)).toEqual(["h1", "own1", "own2"]);
  });

  it("never lets priority candidates take every slot while other alerts are waiting", () => {
    expect(pickLocatorSlots(["h1", "h2", "h3", "h4", "own1"], isHostile)).toEqual(["h1", "h2", "own1"]);
  });

  it("fills every slot with priority candidates when nothing else is waiting", () => {
    expect(pickLocatorSlots(["h1", "h2", "h3", "h4"], isHostile)).toEqual(["h1", "h2", "h3"]);
  });
});
