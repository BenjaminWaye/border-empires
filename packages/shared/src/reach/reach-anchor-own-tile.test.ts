import { describe, expect, it } from "vitest";

import { grantAnchorToBorder, tileKey, type ReachAnchor } from "./reach.js";

// Regression coverage for capturing a town/dock/outpost deep inside a
// rival's still-active reach. Reach is sticky (a rival's existing border
// never gets pushed back just because a new anchor activated somewhere
// inside it — see reach.ts's module doc comment), but a captured anchor
// must still register as having reach on the one tile it's physically
// standing on. Split into its own file (rather than folded into
// reach.test.ts) to keep that file under the 500-line cap — see
// AGENTS.md's file-line-limit rule.
describe("grantAnchorToBorder — anchor's own tile always wins", () => {
  it("is always granted, even when a rival is still live-defending it", () => {
    const existing = new Map([
      [tileKey(5, 5), "rival"],
      [tileKey(5, 6), "rival"]
    ]);
    const capturedTown: ReachAnchor = { x: 5, y: 5, ownerId: "capturer", activatedAt: 2, kind: "TOWN" };
    const { border, overtaken } = grantAnchorToBorder(existing, capturedTown, (ownerId) =>
      // Rival's larger empire still live-covers every tile in the captured
      // town's disk, including the town's own tile.
      ownerId === "rival" ? new Set([tileKey(5, 5), tileKey(5, 6)]) : new Set()
    );
    // The captured town's own tile flips to its new owner regardless of the
    // rival's live defense there...
    expect(border.get(tileKey(5, 5))).toBe("capturer");
    expect(overtaken).toContainEqual({ tileKey: tileKey(5, 5), fromOwnerId: "rival", toOwnerId: "capturer" });
    // ...but sticky territory still holds everywhere else in the disk: the
    // rival's live defense keeps every neighbouring tile exactly as it was.
    expect(border.get(tileKey(5, 6))).toBe("rival");
    expect(overtaken.some((t) => t.tileKey === tileKey(5, 6))).toBe(false);
  });

  // Same guarantee via the "empty slot but rival is SETTLED there" branch
  // (settledOwnerAt), not just the "already-claimed-in-border" branch above.
  it("is granted even through the empty-slot/SETTLED branch", () => {
    const capturedDock: ReachAnchor = { x: 5, y: 5, ownerId: "capturer", activatedAt: 2, kind: "DOCK" };
    const { border, overtaken } = grantAnchorToBorder(
      new Map(), // no border entry at all for (5,5)
      capturedDock,
      (ownerId) => (ownerId === "rival" ? new Set([tileKey(5, 5)]) : new Set()),
      (key) => (key === tileKey(5, 5) ? "rival" : undefined)
    );
    expect(border.get(tileKey(5, 5))).toBe("capturer");
    expect(overtaken).toContainEqual({ tileKey: tileKey(5, 5), fromOwnerId: "rival", toOwnerId: "capturer" });
  });
});

// A landed AFC (ReachAnchor.guaranteedRadius) widens the own-tile rule to its
// 3x3 footprint, so a spawn placed beside a rival still owns the ground its
// AFC stands on. Beyond the footprint, sticky territory holds as usual.
describe("grantAnchorToBorder — guaranteedRadius", () => {
  it("grants every tile within guaranteedRadius over a rival's live defense, and nothing past it", () => {
    const rivalKeys: string[] = [];
    for (let y = 2; y <= 8; y += 1) for (let x = 2; x <= 8; x += 1) rivalKeys.push(tileKey(x, y));
    const existing = new Map(rivalKeys.map((key) => [key, "rival"] as const));
    const landedAfc: ReachAnchor = { x: 5, y: 5, ownerId: "newcomer", activatedAt: 2, kind: "TOWN", guaranteedRadius: 1 };
    const { border } = grantAnchorToBorder(existing, landedAfc, (ownerId) => (ownerId === "rival" ? new Set(rivalKeys) : new Set()));
    const granted = rivalKeys.filter((key) => border.get(key) === "newcomer").sort();
    const footprint: string[] = [];
    for (let y = 4; y <= 6; y += 1) for (let x = 4; x <= 6; x += 1) footprint.push(tileKey(x, y));
    expect(granted).toEqual(footprint.sort());
  });
});
