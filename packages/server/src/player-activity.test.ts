import { describe, expect, it } from "vitest";

import { appendPlayerActivityEntry, buildTownActivityEntry } from "./player-activity.js";

describe("player activity inbox", () => {
  it("builds named town capture entries with tile focus metadata", () => {
    const entry = buildTownActivityEntry({
      kind: "lost",
      townName: "Aetherwick",
      actorName: "Red Empire",
      tileKey: "18,42",
      at: 1000
    });

    expect(entry.title).toBe("Town Lost");
    expect(entry.detail).toBe("Aetherwick was captured by Red Empire.");
    expect(entry.tileKey).toBe("18,42");
    expect(entry.actionLabel).toBe("Center");
  });

  it("keeps only the newest offline activity entries", () => {
    let inbox = [] as ReturnType<typeof buildTownActivityEntry>[];
    for (let index = 0; index < 30; index += 1) {
      inbox = appendPlayerActivityEntry(
        inbox,
        buildTownActivityEntry({
          kind: "captured",
          townName: `Town ${index}`,
          actorName: "Blue Empire",
          tileKey: `${index},${index}` as `${number},${number}`,
          at: index
        })
      );
    }

    expect(inbox).toHaveLength(24);
    expect(inbox[0]?.detail).toContain("Town 6");
    expect(inbox.at(-1)?.detail).toContain("Town 29");
  });
});
