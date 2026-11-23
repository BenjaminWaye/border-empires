import { describe, expect, it } from "vitest";
import { createUnsettledTileCollector } from "./unsettle-encirclement.js";

describe("createUnsettledTileCollector", () => {
  it("collects downgrades per owner only inside collect, and forgets them afterwards", () => {
    const collector = createUnsettledTileCollector();
    collector.record("0,0", "player-2");

    let taken: string[] = [];
    collector.collect(() => {
      collector.collect(() => collector.record("1,1", "player-2"));
      collector.record("2,1", "player-2");
      collector.record("3,1", "player-3");
      taken = collector.take("player-2");
      expect(collector.take("player-2")).toEqual([]);
    });

    expect(taken).toEqual(["1,1", "2,1"]);
    collector.collect(() => expect(collector.take("player-3")).toEqual([]));
  });
});
