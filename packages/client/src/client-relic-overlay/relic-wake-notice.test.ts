import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RelicMapHint } from "@border-empires/shared";
import type { FeedEntry } from "../client-types.js";
import { announceNewRelicWakes, resetRelicWakeNoticesForTest } from "./relic-wake-notice.js";

const hints = (...list: RelicMapHint[]): Map<string, RelicMapHint> => new Map(list.map((hint) => [`${hint.x},${hint.y}`, hint]));
const names: Record<string, string> = { rival: "House Vey" };

describe("announceNewRelicWakes", () => {
  let posted: FeedEntry[];
  const push = (entry: FeedEntry): void => {
    posted.push(entry);
  };
  beforeEach(() => {
    posted = [];
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
    resetRelicWakeNoticesForTest();
  });

  it("names a rival's running relic once, with Show centring on the site", () => {
    const state = { me: "me", relicMapHints: hints({ x: 440, y: 165, kind: "WAKE", ownerId: "rival" }) };
    expect(announceNewRelicWakes(state, push, (id) => names[id], 1000)).toBe(1);
    expect(posted[0]).toMatchObject({ title: "Concordance relic running", text: "House Vey · (440, 165)", focusX: 440, focusY: 165, actionLabel: "Show", alert: true });
    expect(announceNewRelicWakes(state, push, (id) => names[id], 2000)).toBe(0);
    expect(posted).toHaveLength(1);
  });

  it("does not repeat a wake after a reload", () => {
    const state = { me: "me", relicMapHints: hints({ x: 440, y: 165, kind: "WAKE", ownerId: "rival" }) };
    announceNewRelicWakes(state, push, (id) => names[id]);
    resetRelicWakeNoticesForTest();
    expect(announceNewRelicWakes(state, push, (id) => names[id])).toBe(0);
  });

  it("waits up to 30s for the operator's name before falling back", () => {
    const state = { me: "me", relicMapHints: hints({ x: 1, y: 2, kind: "WAKE", ownerId: "rival" }) };
    expect(announceNewRelicWakes(state, push, () => undefined, 0)).toBe(0);
    expect(announceNewRelicWakes(state, push, (id) => names[id], 5_000)).toBe(1);
    expect(posted[0]?.text).toBe("House Vey · (1, 2)");
    const other = { me: "me", relicMapHints: hints({ x: 3, y: 4, kind: "WAKE", ownerId: "ghost" }) };
    expect(announceNewRelicWakes(other, push, () => undefined, 10_000)).toBe(0);
    expect(announceNewRelicWakes(other, push, () => undefined, 40_000)).toBe(1);
    expect(posted[1]?.text).toBe("A rival House · (3, 4)");
  });

  it("announces again when another House takes the relic over", () => {
    const named = (id: string): string => (id === "rival" ? "House Vey" : "House Orr");
    announceNewRelicWakes({ me: "me", relicMapHints: hints({ x: 1, y: 2, kind: "WAKE", ownerId: "rival" }) }, push, named);
    expect(announceNewRelicWakes({ me: "me", relicMapHints: hints({ x: 1, y: 2, kind: "WAKE", ownerId: "other" }) }, push, named)).toBe(1);
    expect(posted[1]?.text).toBe("House Orr · (1, 2)");
  });

  it("ignores transponder beams, survey signatures and a client with no player yet", () => {
    const state = { me: "me", relicMapHints: hints({ x: 1, y: 2, kind: "RELIC" }, { x: 3, y: 4, kind: "RESOURCE", resource: "TITANIUM" }) };
    expect(announceNewRelicWakes(state, push, () => undefined)).toBe(0);
    expect(announceNewRelicWakes({ me: "", relicMapHints: hints({ x: 1, y: 2, kind: "WAKE", ownerId: "rival" }) }, push, () => undefined)).toBe(0);
  });
});
