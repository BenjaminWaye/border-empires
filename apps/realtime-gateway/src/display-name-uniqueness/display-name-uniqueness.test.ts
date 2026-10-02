import { describe, expect, it } from "vitest";

import {
  buildTakenNameSet,
  createSerialLock,
  displayNameKey,
  isDisplayNameTaken,
  suggestAlternativeName,
  providerDisplayName,
  suggestDefaultDisplayName,
  suggestHouseName
} from "./display-name-uniqueness.js";

const takenOf = (...names: string[]): Set<string> => new Set(names.map(displayNameKey));

describe("displayNameKey", () => {
  it("ignores case, surrounding and repeated whitespace, and Unicode look-alikes", () => {
    const key = displayNameKey("House Ashgrove");
    expect(displayNameKey("  house   ASHGROVE ")).toBe(key);
    expect(displayNameKey("ＨＯＵＳＥ Ａｓｈｇｒｏｖｅ")).toBe(key);
    expect(displayNameKey("House Ashgrov")).not.toBe(key);
  });
});

describe("isDisplayNameTaken", () => {
  it("blocks names held by another player, however they are spelled", () => {
    expect(isDisplayNameTaken("  house ashgrove", takenOf("House Ashgrove"))).toBe(true);
    expect(isDisplayNameTaken("House Valmont", takenOf("House Ashgrove"))).toBe(false);
  });

  it("blocks reserved names even when nobody holds them", () => {
    for (const name of ["Barbarians", "barbarian", "AI 3", "ai  12", "Nauticus", "House Noname 7", "  house  NONAME 12 "]) {
      expect(isDisplayNameTaken(name, new Set())).toBe(true);
    }
    expect(isDisplayNameTaken("AI Overlord", new Set())).toBe(false);
    expect(isDisplayNameTaken("House Noname", new Set())).toBe(false);
  });
});

describe("buildTakenNameSet", () => {
  it("collects stored and live names, excludes the asking player, and lets live overrides count", async () => {
    const taken = await buildTakenNameSet("me", {
      profileStore: {
        listAllNamed: async () => [
          { playerId: "me", name: "My Old Name" },
          { playerId: "a", name: "Ada" },
          { playerId: "b" }
        ]
      },
      profileOverrides: {
        entries: () =>
          new Map<string, { name?: string }>([
            ["me", { name: "My Live Name" }],
            ["c", { name: "Cid" }]
          ]).entries()
      }
    });

    expect([...taken].sort()).toEqual(["ada", "cid"]);
  });
});

describe("suggestHouseName", () => {
  it("returns a free 'House <Surname>' within the length limit", () => {
    for (let i = 0; i < 200; i += 1) {
      const name = suggestHouseName(new Set());
      expect(name).toMatch(/^House [A-Z][a-z]+$/);
      expect(name.length).toBeLessThanOrEqual(24);
    }
  });

  it("never returns a taken name, even when almost every combination is taken", () => {
    let calls = 0;
    const random = () => {
      calls += 1;
      return (calls % 97) / 97;
    };
    const first = suggestHouseName(new Set(), random);
    const taken = takenOf(first);
    calls = 0;
    const second = suggestHouseName(taken, random);
    expect(isDisplayNameTaken(second, taken)).toBe(false);
  });

  it("falls back to a numbered house when the whole pool is taken", () => {
    const everything = new Proxy(new Set<string>(), {
      get: (target, prop) => (prop === "has" ? (key: string) => !/ [ivx]+$|\d+$/.test(key) : Reflect.get(target, prop))
    });
    const name = suggestHouseName(everything, () => 0);
    expect(name).toMatch(/^House [A-Za-z]+ (II|III|IV|V|VI|VII|VIII|IX|X)$/);
    expect(name.length).toBeLessThanOrEqual(24);
  });
});

describe("suggestAlternativeName", () => {
  it("adds the first free numeral and stays within 24 characters", () => {
    expect(suggestAlternativeName("Ada", takenOf("Ada"))).toBe("Ada II");
    expect(suggestAlternativeName("Ada", takenOf("Ada", "Ada II"))).toBe("Ada III");
    expect(suggestAlternativeName("  Ada   Byron ", takenOf("Ada Byron"))).toBe("Ada Byron II");
    const long = "A".repeat(24);
    const suggestion = suggestAlternativeName(long, takenOf(long));
    expect(suggestion.length).toBeLessThanOrEqual(24);
    expect(suggestion.endsWith(" II")).toBe(true);
  });
});

describe("suggestDefaultDisplayName", () => {
  it("keeps a free real name from the sign-in provider", () => {
    expect(suggestDefaultDisplayName("Ada Lovelace", new Set())).toBe("Ada Lovelace");
  });

  it("replaces a taken name with a free variation", () => {
    expect(suggestDefaultDisplayName("Ada Lovelace", takenOf("ada lovelace"))).toBe("Ada Lovelace II");
  });

  it("replaces the placeholder and missing names with a house name", () => {
    for (const preferred of [undefined, "", " ", "Player", "player", "x"]) {
      expect(suggestDefaultDisplayName(preferred, new Set())).toMatch(/^House /);
    }
  });
});

describe("providerDisplayName", () => {
  it("keeps a real provider name and drops one that is just the email's local part", () => {
    expect(providerDisplayName({ playerName: "Ada Lovelace", authEmail: "ada@example.com" })).toBe("Ada Lovelace");
    expect(providerDisplayName({ playerName: "ada", authEmail: "Ada@example.com" })).toBeUndefined();
    expect(providerDisplayName({ playerName: "Player" })).toBe("Player");
    expect(providerDisplayName({ playerName: "Ada" })).toBe("Ada");
  });
});

describe("createSerialLock", () => {
  it("runs tasks strictly one after another, in order", async () => {
    const lock = createSerialLock();
    const log: string[] = [];
    const slow = lock(async () => {
      log.push("a:start");
      await new Promise((resolve) => setTimeout(resolve, 20));
      log.push("a:end");
    });
    const fast = lock(async () => {
      log.push("b:start");
      log.push("b:end");
    });
    await Promise.all([slow, fast]);
    expect(log).toEqual(["a:start", "a:end", "b:start", "b:end"]);
  });

  it("keeps working after a task throws, and still reports that failure to its caller", async () => {
    const lock = createSerialLock();
    await expect(lock(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    await expect(lock(async () => "still ok")).resolves.toBe("still ok");
  });
});
