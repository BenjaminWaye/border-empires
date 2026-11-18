import { describe, expect, it } from "vitest";
import { afcFounderOverviewLine } from "./client-afc-founder-line.js";

const names = (id?: string | null) => ({ p2: "Varn", p3: "House Sigrid" })[id as "p2" | "p3"];

describe("AFC founder line", () => {
  it("names the founding House of a captured AFC", () => {
    const line = afcFounderOverviewLine({ afc: { ownerId: "p1", status: "active", capturedAt: 5, foundedBy: "p2" } }, names, "p1");
    expect(line?.html).toBe("Founded by House Varn · captured");
  });

  it("names an AFC still held by its founder without the capture note, and keeps an already styled House name", () => {
    expect(afcFounderOverviewLine({ afc: { ownerId: "p3", status: "active" } }, names, "p1")?.html).toBe("Founded by House Sigrid");
    expect(afcFounderOverviewLine({ afc: { ownerId: "p1", status: "active" } }, names, "p1")?.html).toBe("Founded by your House");
  });

  it("shows nothing for a tile without an AFC, or an AFC whose founder was never recorded", () => {
    expect(afcFounderOverviewLine({}, names, "p1")).toBeUndefined();
    expect(afcFounderOverviewLine({ afc: { ownerId: "p2", status: "active", capturedAt: 5 } }, names, "p1")).toBeUndefined();
  });
});
