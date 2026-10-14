// Which look the incursion pocket edge uses where a rival pocket borders the
// viewer's own land (see client-incursion-breach-layout.ts). Candidate
// "breach" looks are being compared in-game before one replaces the straight
// strip, so for now this is an admin-only switch (Settings > Admin):
//
//  - "straight": the original solid strip just inside the pocket (default).
//  - "spikes":   the strip plus a row of evenly spaced teeth in the
//                attacker's colour pointing into my land (Hearts of Iron IV
//                front lines).
//  - "ember":    a thin glowing fissure along the boundary with a soft
//                flickering glow either side (Total War: Warhammer
//                corruption fronts, Diablo lava seams).
//  - "ink":      the intruder's colour bleeds into my land like watercolour,
//                with a feathered, pigment-darkened front (Civilization VI's
//                watercolour map).
//  - "veil":     a low translucent curtain of the intruder's light rising
//                from the boundary (Stellaris borders, and our own Aether
//                Survey Line).
//
// Persisted to localStorage, with a `?breachedge=<style>` URL param taking
// precedence (handy for screenshots and regression checks) -- same pattern as
// client-siege-tower-rotation-mode.ts.

export type IncursionBreachStyle = "straight" | "spikes" | "ember" | "ink" | "veil";

export const INCURSION_BREACH_STYLES: readonly IncursionBreachStyle[] = ["straight", "spikes", "ember", "ink", "veil"];

const STORAGE_KEY = "border-empires-incursion-breach-style";

export const isIncursionBreachStyle = (value: unknown): value is IncursionBreachStyle =>
  typeof value === "string" && (INCURSION_BREACH_STYLES as readonly string[]).includes(value);

const urlOverride = (): IncursionBreachStyle | undefined => {
  if (typeof window === "undefined") return undefined;
  const value = new URLSearchParams(window.location.search).get("breachedge");
  return isIncursionBreachStyle(value) ? value : undefined;
};

const storedStyle = (): IncursionBreachStyle | undefined => {
  if (typeof window === "undefined") return undefined;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return isIncursionBreachStyle(value) ? value : undefined;
  } catch {
    return undefined;
  }
};

let style: IncursionBreachStyle = urlOverride() ?? storedStyle() ?? "straight";

export const incursionBreachStyle = (): IncursionBreachStyle => style;

export const setIncursionBreachStyle = (next: IncursionBreachStyle): void => {
  style = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Private mode / storage disabled -- the in-memory style still applies.
  }
};
