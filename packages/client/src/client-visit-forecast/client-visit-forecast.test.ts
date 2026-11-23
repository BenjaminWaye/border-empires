// End-of-visit forecast (docs/visit-as-a-turn.md §2.4): what happens while the player is away.
import { describe, expect, it } from "vitest";
import { FORECAST_TOWN_CAP, MIN_RETURN_MS, formatAhead, visitForecast, type ForecastInput } from "./client-visit-forecast.js";

const MIN = 60_000;
const HOUR = 60 * MIN;

const input = (extra: Partial<ForecastInput> = {}): ForecastInput => ({
  active: [], queued: 0, planned: 0, expansions: { total: 0, paused: 0 },
  manpower: { current: 750, cap: 750, fullInMs: 0, nextBatchInMs: HOUR, nextBatchGain: 0 },
  towns: [], holds: [], truces: [], ...extra
});

describe("visit forecast", () => {
  it("formats times for a phone row", () => {
    expect([0, 40_000, 60_000, 45 * MIN, 2 * HOUR, 7 * HOUR + 40 * MIN, 24 * HOUR, 51 * HOUR].map(formatAhead)).toEqual(["1s", "40s", "1m", "45m", "2h", "7h 40m", "1d", "2d 3h"]);
  });

  it("is empty with nothing underway and a full pool", () => {
    expect(visitForecast(input())).toEqual({ items: [] });
  });

  it("names a single build with its tile, sums several, and gives queued work a count instead of a time", () => {
    const one = visitForecast(input({ active: [{ label: "Fort", x: 3, y: 4, remainingMs: 40_000 }] }));
    expect(one.items).toEqual([{ kind: "builds", text: "Fort at (3, 4) finishes in 40s", inMs: 40_000, focus: { x: 3, y: 4 } }]);
    const many = visitForecast(input({
      active: [{ label: "Fort", x: 3, y: 4, remainingMs: 40_000 }, { label: "Garrisoning", x: 5, y: 6, remainingMs: 5_000 }, { label: "Foundry", x: 7, y: 8, remainingMs: 90_000, paused: true }],
      queued: 6, expansions: { total: 2, paused: 1 }
    }));
    expect(many.items.map((item) => item.text)).toEqual([
      "2 builds and garrisons finish within 40s",
      "1 build is paused by an attack on the tile",
      "6 more queued: each starts when a slot is free",
      "2 queued expansions keep claiming toward their targets (1 waiting for manpower)"
    ]);
    expect(many.items.filter((item) => item.kind !== "builds").every((item) => item.inMs === undefined)).toBe(true);
    // Nothing here is far enough away to be a reason to come back.
    expect(many.returnIn).toBeUndefined();
  });

  it("says when manpower is full, with the next batch only when it does not already fill the pool", () => {
    const twoBatches = visitForecast(input({ manpower: { current: 300, cap: 750, fullInMs: 5 * HOUR + 20 * MIN, nextBatchInMs: HOUR + 20 * MIN, nextBatchGain: 240 } }));
    expect(twoBatches.items.map((item) => item.text)).toEqual(["Next manpower batch +240 in 1h 20m", "Manpower full in 5h 20m"]);
    expect(twoBatches.returnIn).toEqual({ inMs: 5 * HOUR + 20 * MIN, reason: "manpower is full" });
    const oneBatch = visitForecast(input({ manpower: { current: 700, cap: 750, fullInMs: HOUR, nextBatchInMs: HOUR, nextBatchGain: 50 } }));
    expect(oneBatch.items.map((item) => item.text)).toEqual(["Manpower full in 1h"]);
    // Not refilling: no time is promised.
    expect(visitForecast(input({ manpower: { current: 10, cap: 750, fullInMs: undefined, nextBatchInMs: HOUR, nextBatchGain: 0 } })).items).toEqual([]);
  });

  it("lists the soonest towns, running holds and truces in time order, and suggests the earliest one worth returning for", () => {
    const towns = [9, 30, 14, 50].map((hours, i) => ({ name: `Town${i}`, x: i, y: i, nextTier: "City", readyInMs: hours * HOUR }));
    const forecast = visitForecast(input({
      active: [{ label: "Fort", x: 1, y: 1, remainingMs: 30_000 }],
      manpower: { current: 100, cap: 750, fullInMs: 11 * HOUR, nextBatchInMs: 3 * HOUR, nextBatchGain: 200 },
      towns,
      holds: [{ pathName: "Maritime Supremacy", holderName: "Me", mine: true, remainingMs: 18 * HOUR }, { pathName: "Town Control", holderName: "Konrad", mine: false, remainingMs: 6 * HOUR }],
      truces: [{ name: "Kara", endsInMs: 10 * MIN }]
    }));
    expect(forecast.items.map((item) => item.text)).toEqual([
      "Fort at (1, 1) finishes in 30s",
      "Truce with Kara ends in 10m",
      "Next manpower batch +200 in 3h",
      "Konrad's Town Control hold wins the Sector Contest in 6h unless it is broken",
      "Town0 can be upgraded to City in about 9h",
      "Manpower full in 11h",
      "Town2 can be upgraded to City in about 14h",
      "Your Maritime Supremacy hold wins the Sector Contest in 18h if it stands",
      "Town1 can be upgraded to City in about 1d 6h"
    ]);
    expect(forecast.items.filter((item) => item.kind === "town_ready")).toHaveLength(FORECAST_TOWN_CAP);
    // The truce ends too soon to leave for, and a manpower batch alone is not a reason to return.
    expect(forecast.returnIn).toEqual({ inMs: 6 * HOUR, reason: "a rival's hold is about to complete" });
    expect(forecast.items.find((item) => item.kind === "hold_rival")?.open).toBe("ranks");
    expect(forecast.items.find((item) => item.kind === "truce_end")?.open).toBe("diplomacy");
  });

  it("suggests coming back for a truce or a build only once it is at least MIN_RETURN_MS away", () => {
    expect(visitForecast(input({ truces: [{ name: "Kara", endsInMs: MIN_RETURN_MS - 1 }] })).returnIn).toBeUndefined();
    expect(visitForecast(input({ truces: [{ name: "Kara", endsInMs: MIN_RETURN_MS }] })).returnIn).toEqual({ inMs: MIN_RETURN_MS, reason: "a truce ends" });
    expect(visitForecast(input({ active: [{ label: "Fort", x: 1, y: 1, remainingMs: 20 * MIN }] })).returnIn).toEqual({ inMs: 20 * MIN, reason: "your slots are free again" });
  });

  it("never says turn", () => {
    const forecast = visitForecast(input({
      active: [{ label: "Fort", x: 1, y: 1, remainingMs: 30_000 }], queued: 2, expansions: { total: 1, paused: 1 },
      manpower: { current: 100, cap: 750, fullInMs: 11 * HOUR, nextBatchInMs: 3 * HOUR, nextBatchGain: 200 },
      towns: [{ name: "Rivergate", x: 1, y: 1, nextTier: "City", readyInMs: HOUR }],
      holds: [{ pathName: "Town Control", holderName: "Konrad", mine: false, remainingMs: HOUR }], truces: [{ name: "Kara", endsInMs: HOUR }]
    }));
    expect(forecast.items.map((item) => item.text).join(" ")).not.toMatch(/\bturns?\b/i);
    expect(forecast.items.find((item) => item.kind === "expansions")?.text).toBe("1 queued expansion keeps claiming toward its target (waiting for manpower)");
  });

  // Review of #2944: only the server-held queue runs while the game is closed.
  it("tells queued work the server holds apart from entries planned in this browser", () => {
    const texts = visitForecast(input({ queued: 20, planned: 15 })).items.map((item) => item.text);
    expect(texts).toEqual(["20 more queued: each starts when a slot is free", "15 more planned past the queue: they start only while the game is open"]);
  });

  // Review of #2944: with work queued behind it, a finished build frees nothing.
  it("does not suggest coming back for free slots while work is queued or paused behind the build", () => {
    const fort = { label: "Fort", x: 1, y: 1, remainingMs: 20 * MIN };
    expect(visitForecast(input({ active: [fort], queued: 6 })).returnIn).toBeUndefined();
    expect(visitForecast(input({ active: [fort], planned: 1 })).returnIn).toBeUndefined();
    expect(visitForecast(input({ active: [fort, { label: "Foundry", x: 2, y: 2, remainingMs: 5 * MIN, paused: true }] })).returnIn).toBeUndefined();
  });

  // Review of #2944: a hold ten minutes from deciding the contest must not be answered with "come back in 7h".
  it("suggests no later return while a hold is about to complete", () => {
    const forecast = visitForecast(input({
      manpower: { current: 100, cap: 750, fullInMs: 7 * HOUR, nextBatchInMs: HOUR, nextBatchGain: 200 },
      holds: [{ pathName: "Town Control", holderName: "Konrad", mine: false, remainingMs: 10 * MIN }]
    }));
    expect(forecast.returnIn).toBeUndefined();
    expect(forecast.items[0]?.kind).toBe("hold_rival");
  });

  it("says a build past its time is finishing instead of counting a second", () => {
    expect(visitForecast(input({ active: [{ label: "Fort", x: 3, y: 4, remainingMs: 0 }] })).items[0]?.text).toBe("Fort at (3, 4) is finishing");
  });
});
