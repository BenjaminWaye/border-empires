import { describe, expect, it } from "vitest";
import { afcFounderOverviewLines } from "./client-afc-founder-line.js";

const names = (id?: string | null) => ({ p2: "Varn", p3: "House Sigrid" })[id as "p2" | "p3"];

describe("AFC founder line", () => {
  it("names the founding House of a captured AFC", () => {
    const [line] = afcFounderOverviewLines({ afc: { ownerId: "p1", status: "active", capturedAt: 5, foundedBy: "p2" } }, names, "p1");
    expect(line?.html).toBe("Founded by House Varn · captured");
    // The viewer's own AFC, taken by someone else.
    expect(afcFounderOverviewLines({ afc: { ownerId: "p2", status: "active", capturedAt: 5, foundedBy: "p1" } }, names, "p1")[0]?.html).toBe("Founded by your House · captured");
  });

  it("names a rival's own AFC without the capture note, keeps an already styled name, and stays quiet on the viewer's own AFC", () => {
    expect(afcFounderOverviewLines({ afc: { ownerId: "p3", status: "active" } }, names, "p1")[0]?.html).toBe("Founded by House Sigrid");
    expect(afcFounderOverviewLines({ afc: { ownerId: "p1", status: "active" } }, names, "p1")).toEqual([]);
  });

  it("shows nothing without an AFC, an unrecorded founder, or a founder whose name is unknown", () => {
    expect(afcFounderOverviewLines({}, names, "p1")).toEqual([]);
    expect(afcFounderOverviewLines({ afc: { ownerId: "p2", status: "active", capturedAt: 5 } }, names, "p1")).toEqual([]);
    expect(afcFounderOverviewLines({ afc: { ownerId: "p9", status: "active" } }, names, "p1")).toEqual([]);
  });
});
