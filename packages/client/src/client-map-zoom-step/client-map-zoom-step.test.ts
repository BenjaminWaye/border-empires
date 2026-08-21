import { describe, expect, it } from "vitest";
import { zoomStepFor } from "./client-map-zoom-step.js";

// Mirrors client-constants.ts. Inlined rather than imported so this stays a
// pure unit test — client-constants pulls in @border-empires/shared.
const MIN_ZOOM = 10;
const MAX_ZOOM = 192;

// One standard mouse-wheel notch in Chrome.
const NOTCH_PX = 100;

const stepOut = (zoom: number): number =>
  zoomStepFor({ zoom, deltaY: NOTCH_PX, deltaMode: 0, minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM });
const stepIn = (zoom: number): number =>
  zoomStepFor({ zoom, deltaY: -NOTCH_PX, deltaMode: 0, minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM });

const notchesToCross = (from: number, to: number): number => {
  const stepping = from < to ? stepIn : stepOut;
  const done = from < to ? (z: number) => z >= to : (z: number) => z <= to;
  let zoom = from;
  let notches = 0;
  while (!done(zoom) && notches < 1000) {
    zoom = stepping(zoom);
    notches += 1;
  }
  return notches;
};

describe("wheel zoom stepping", () => {
  it("crosses the whole zoom range in a couple dozen notches, not ~180", () => {
    // The flat ±1 step this replaced needed 182 notches each way, which is the
    // whole reason zooming felt slow. Both directions must stay bounded.
    expect(notchesToCross(MIN_ZOOM, MAX_ZOOM)).toBeLessThanOrEqual(25);
    expect(notchesToCross(MAX_ZOOM, MIN_ZOOM)).toBeLessThanOrEqual(25);
  });

  it("moves by at least one level at every zoom, so no notch is ever a no-op", () => {
    for (let zoom = MIN_ZOOM; zoom <= MAX_ZOOM; zoom += 1) {
      if (zoom > MIN_ZOOM) expect(stepOut(zoom)).toBeLessThan(zoom);
      if (zoom < MAX_ZOOM) expect(stepIn(zoom)).toBeGreaterThan(zoom);
    }
  });

  it("steps proportionally — a notch is a similar fraction at both ends", () => {
    // The flat step's failure mode: at MAX_ZOOM a ±1 notch was a 0.5% change
    // (invisible) while at MIN_ZOOM it was 10%.
    const fractionAt = (zoom: number): number => (zoom - stepOut(zoom)) / zoom;
    const lowFraction = fractionAt(MIN_ZOOM + 10);
    const highFraction = fractionAt(MAX_ZOOM);
    expect(lowFraction).toBeGreaterThan(0.1);
    expect(highFraction).toBeGreaterThan(0.1);
    expect(Math.abs(highFraction - lowFraction)).toBeLessThan(0.05);
  });

  it("clamps at both bounds", () => {
    expect(stepOut(MIN_ZOOM)).toBe(MIN_ZOOM);
    expect(stepIn(MAX_ZOOM)).toBe(MAX_ZOOM);
    expect(zoomStepFor({ zoom: 5, deltaY: NOTCH_PX, deltaMode: 0, minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM })).toBe(MIN_ZOOM);
    expect(zoomStepFor({ zoom: 500, deltaY: -NOTCH_PX, deltaMode: 0, minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM })).toBe(MAX_ZOOM);
  });

  it("stays near the starting zoom after equal travel out and back", () => {
    // Rounding to integer px/tile means this cannot be exact, but a gesture
    // that returns to where it started should not drift far.
    let zoom = 48;
    for (let i = 0; i < 6; i += 1) zoom = stepOut(zoom);
    for (let i = 0; i < 6; i += 1) zoom = stepIn(zoom);
    expect(Math.abs(zoom - 48)).toBeLessThanOrEqual(6);
  });

  it("honours deltaY magnitude — a bigger delta travels further", () => {
    const small = zoomStepFor({ zoom: 100, deltaY: 10, deltaMode: 0, minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM });
    const large = zoomStepFor({ zoom: 100, deltaY: NOTCH_PX, deltaMode: 0, minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM });
    expect(small).toBeLessThan(100);
    expect(large).toBeLessThan(small);
  });

  it("caps a single runaway event so one wheel tick cannot cross the range", () => {
    const huge = zoomStepFor({ zoom: MAX_ZOOM, deltaY: 100_000, deltaMode: 0, minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM });
    expect(huge).toBeGreaterThan(MIN_ZOOM);
  });

  it("scales line and page delta modes up relative to pixels", () => {
    const pixels = zoomStepFor({ zoom: 100, deltaY: 3, deltaMode: 0, minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM });
    const lines = zoomStepFor({ zoom: 100, deltaY: 3, deltaMode: 1, minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM });
    expect(lines).toBeLessThan(pixels);
  });

  it("treats a zero or non-finite delta as no movement", () => {
    expect(zoomStepFor({ zoom: 64, deltaY: 0, deltaMode: 0, minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM })).toBe(64);
    expect(zoomStepFor({ zoom: 64, deltaY: Number.NaN, deltaMode: 0, minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM })).toBe(64);
  });
});
