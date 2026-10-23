// Pooled marine slots, one pool per (side, armour kit). Split out of
// popup-marine-overlay-fx.ts when titanium armour (popup-marine-armor.ts)
// added a second model: the overlay asks for "the next attacker in titanium"
// and this hands back a slot from the right model's pool, without the
// overlay tracking a write cursor per pool itself.
//
// The standard pools are built eagerly once the standard model loads, as
// before. The titanium model is only fetched the first time a titanium squad
// is asked for, and its pools grow on demand (capped at `capacity`), so a
// session that never sees an armoured empire never downloads or clones it.
// Until it is ready -- or if it fails to load -- titanium requests fall back
// to the standard pool, so a battle never renders with a squad missing.
import type { Scene } from "three";
import { loadPopupMarineTemplate, type PopupMarineTemplate } from "./popup-marine-asset.js";
import type { MarineArmor } from "./popup-marine-armor.js";
import { createMarineSlot, disposeMarineSlot, type MarineSlot } from "./popup-marine-slot.js";

type SidePools = Record<MarineArmor, MarineSlot[]>;

export type MarinePools = {
  /** Hides every slot and rewinds every pool's cursor -- call once per frame
   * before acquiring. */
  beginFrame: () => void;
  /** The next unused slot this frame for `side` (0 attacker, 1 defender) in
   * `armor`, or undefined once that pool is exhausted. */
  acquire: (side: 0 | 1, armor: MarineArmor) => MarineSlot | undefined;
  hideAll: () => void;
  dispose: () => void;
};

export const createMarinePools = (scene: Scene, capacity: number): MarinePools => {
  let disposed = false;
  const templates: Partial<Record<MarineArmor, PopupMarineTemplate>> = {};
  const requested = new Set<MarineArmor>();
  const pools: [SidePools, SidePools] = [
    { standard: [], titanium: [] },
    { standard: [], titanium: [] }
  ];
  const cursors: [Record<MarineArmor, number>, Record<MarineArmor, number>] = [
    { standard: 0, titanium: 0 },
    { standard: 0, titanium: 0 }
  ];

  const request = (armor: MarineArmor): void => {
    if (requested.has(armor)) return;
    requested.add(armor);
    loadPopupMarineTemplate(armor)
      .then((template) => {
        if (disposed) return;
        templates[armor] = template;
        if (armor !== "standard") return;
        for (const side of pools) {
          side.standard = Array.from({ length: capacity }, (_, i) => createMarineSlot(scene, template, i));
        }
      })
      .catch((err: unknown) => {
        // Nothing renders rather than crashing the whole 3D map: a missing
        // standard model leaves the pools empty (a battle shows its tile
        // highlight with no marines); a missing titanium model just keeps
        // armoured squads on the standard model.
        console.error(`popup-marine ${armor} model failed to load; ${armor === "standard" ? "battle marines will not render" : "armoured squads use the standard model"}`, err);
      });
  };
  request("standard");

  const forEachSlot = (fn: (slot: MarineSlot) => void): void => {
    for (const side of pools) {
      for (const slot of side.standard) fn(slot);
      for (const slot of side.titanium) fn(slot);
    }
  };

  const hideAll = (): void => forEachSlot((slot) => { slot.root.visible = false; });

  const acquireFrom = (side: 0 | 1, armor: MarineArmor): MarineSlot | undefined => {
    const pool = pools[side][armor];
    const index = cursors[side][armor];
    if (index >= capacity) return undefined;
    let slot = pool[index];
    const template = templates[armor];
    if (!slot && armor !== "standard" && template) {
      slot = createMarineSlot(scene, template, index, armor);
      pool.push(slot);
    }
    if (!slot) return undefined;
    cursors[side][armor] = index + 1;
    return slot;
  };

  return {
    beginFrame: () => {
      hideAll();
      for (const cursor of cursors) {
        cursor.standard = 0;
        cursor.titanium = 0;
      }
    },
    acquire: (side, armor) => {
      if (armor === "standard") return acquireFrom(side, "standard");
      request(armor);
      return templates[armor] ? acquireFrom(side, armor) : acquireFrom(side, "standard");
    },
    hideAll,
    dispose: () => {
      disposed = true;
      forEachSlot((slot) => disposeMarineSlot(scene, slot));
      for (const side of pools) {
        side.standard = [];
        side.titanium = [];
      }
    }
  };
};
