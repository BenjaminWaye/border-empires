// Which look the incursion pocket edge uses where a rival pocket borders the
// viewer's own land (see client-incursion-breach-layout.ts). The spikes are
// the default for everyone; the other looks stay selectable on Settings >
// Admin for comparison:
//
//  - "spikes":   (default) an inked, gently meandering front line in the
//                attacker's colour round the pocket, square at the corners,
//                with tall, even triangular teeth pointing into my land
//                (Hearts of Iron IV front lines).
//  - "straight": the original solid strip just inside the pocket.
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
// precedence (handy for screenshots and regression checks).

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

export const DEFAULT_INCURSION_BREACH_STYLE: IncursionBreachStyle = "spikes";

let style: IncursionBreachStyle = urlOverride() ?? storedStyle() ?? DEFAULT_INCURSION_BREACH_STYLE;

export const incursionBreachStyle = (): IncursionBreachStyle => style;

export const setIncursionBreachStyle = (next: IncursionBreachStyle): void => {
  style = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Private mode / storage disabled -- the in-memory style still applies.
  }
};
