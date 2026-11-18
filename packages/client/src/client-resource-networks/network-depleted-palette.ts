import type { TownBuilders } from "../client-map-3d-town-overlay/town-parts.js";
import type { TownColor, TownMeshBuilder } from "../client-map-3d-town-overlay/town-mesh-builder.js";

/**
 * A depleted installation (a Reclamation Works whose field shipped its last
 * load) is drawn from the same model in a darker, unlit palette, so it reads
 * as dead at map scale in both the 2D icon export and the true-3D map.
 */
export const DEPLETED_COLOR: Readonly<Partial<Record<TownColor, TownColor>>> = {
  stoneLight: "stoneDark", stone: "graphite", stoneDark: "graphite", paving: "stoneDark", plate: "stoneDark",
  glass: "window", glassLight: "window", brass: "trunk", brassDark: "ironDark", iron: "ironDark", graphite: "ironDark",
  lamp: "ironDark", lampWarm: "ironDark"
};

const darkened = (builder: TownMeshBuilder): TownMeshBuilder => new Proxy(builder, {
  get: (target, key, receiver) => {
    const member = Reflect.get(target, key, receiver) as unknown;
    if (typeof member !== "function") return member;
    return (...args: unknown[]) => (member as (...rest: unknown[]) => unknown).apply(target,
      args.map(arg => typeof arg === "string" && Object.hasOwn(DEPLETED_COLOR, arg) ? DEPLETED_COLOR[arg as TownColor] : arg));
  }
});

/** Every light is out: glow, halo and steam draw nothing. */
const unlit = (builder: TownMeshBuilder): TownMeshBuilder => new Proxy(builder, {
  get: (target, key, receiver) => {
    const member = Reflect.get(target, key, receiver) as unknown;
    if (typeof member !== "function" || key === "build") return member;
    // withAnim(anim, draw) still runs its draw callback so nested builders stay consistent.
    if (key === "withAnim") return (_anim: unknown, draw: () => void) => draw();
    return () => undefined;
  }
});

/** The base plate loses its polished marble finish too: it is drawn as plain dark stone. */
export const depletedTownBuilders = (t: TownBuilders): TownBuilders => ({
  ...t, body: darkened(t.body), plinth: darkened(t.body), glow: unlit(t.glow), halo: unlit(t.halo), steam: unlit(t.steam)
});
