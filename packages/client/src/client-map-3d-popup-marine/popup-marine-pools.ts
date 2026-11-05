// Pooled marine slots, one pool per (side, soldier model). Split out of
// popup-marine-overlay-fx.ts when the heavy armour added a second model: the
// overlay asks for "the next attacker in heavy armour" and this hands back a
// slot from the right model's pool, without the overlay tracking a write
// cursor per pool itself.
//
// The standard pools are built eagerly once the standard model loads. The
// heavy model is only fetched the first time a squad needing it is asked
// for, and its pools grow on demand (capped at `capacity`), so a session
// that never sees a Titanium Weapons Factory never downloads or clones it.
// Until it is ready -- or if it fails to load -- requests fall back to the
// standard pool, so a battle never renders with a squad member missing.
import type { Scene, Texture } from "three";
import { loadPopupMarineTemplate, type PopupMarineTemplate } from "./popup-marine-asset.js";
import { MARINE_MODEL_KEYS, type MarineModelKey } from "./popup-marine-gear.js";
import { createMarineSlot, disposeMarineSlot, type MarineSlot } from "./popup-marine-slot.js";

type SidePools = Record<MarineModelKey, MarineSlot[]>;

const emptyPools = (): SidePools => ({ standard: [], heavy: [] });
const zeroCursors = (): Record<MarineModelKey, number> => ({ standard: 0, heavy: 0 });

export type MarinePools = {
  /** Hides every slot and rewinds every pool's cursor -- call once per frame
   * before acquiring. */
  beginFrame: () => void;
  /** The next unused slot this frame for `side` (0 attacker, 1 defender) in
   * `model`, or undefined once that pool is exhausted. */
  acquire: (side: 0 | 1, model: MarineModelKey) => MarineSlot | undefined;
  hideAll: () => void;
  dispose: () => void;
};

/** `envMap` is what the heavy armour's bare metal reflects (the shared
 * building environment map; see popup-marine-material.ts). */
export const createMarinePools = (scene: Scene, capacity: number, envMap?: Texture): MarinePools => {
  let disposed = false;
  const templates: Partial<Record<MarineModelKey, PopupMarineTemplate>> = {};
  const requested = new Set<MarineModelKey>();
  const pools: [SidePools, SidePools] = [emptyPools(), emptyPools()];
  const cursors: [Record<MarineModelKey, number>, Record<MarineModelKey, number>] = [zeroCursors(), zeroCursors()];

  const request = (model: MarineModelKey): void => {
    if (requested.has(model)) return;
    requested.add(model);
    loadPopupMarineTemplate(model)
      .then((template) => {
        if (disposed) return;
        templates[model] = template;
        if (model !== "standard") return;
        for (const side of pools) {
          side.standard = Array.from({ length: capacity }, (_, i) => createMarineSlot(scene, template, i));
        }
      })
      .catch((err: unknown) => {
        // Nothing renders rather than crashing the whole 3D map: a missing
        // standard model leaves the pools empty (a battle shows its tile
        // highlight with no marines); a missing heavy model just keeps those
        // squads on the standard model.
        console.error(
          `popup-marine ${model} model failed to load; ${model === "standard" ? "battle marines will not render" : "its squads use the standard model"}`,
          err
        );
      });
  };
  request("standard");

  const forEachSlot = (fn: (slot: MarineSlot) => void): void => {
    for (const side of pools) {
      for (const model of MARINE_MODEL_KEYS) for (const slot of side[model]) fn(slot);
    }
  };

  const hideAll = (): void => forEachSlot((slot) => { slot.root.visible = false; });

  const acquireFrom = (side: 0 | 1, model: MarineModelKey): MarineSlot | undefined => {
    const pool = pools[side][model];
    const index = cursors[side][model];
    if (index >= capacity) return undefined;
    let slot = pool[index];
    const template = templates[model];
    if (!slot && model !== "standard" && template) {
      slot = createMarineSlot(scene, template, index, model, envMap);
      pool.push(slot);
    }
    if (!slot) return undefined;
    cursors[side][model] = index + 1;
    return slot;
  };

  return {
    beginFrame: () => {
      hideAll();
      cursors[0] = zeroCursors();
      cursors[1] = zeroCursors();
    },
    acquire: (side, model) => {
      if (model === "standard") return acquireFrom(side, "standard");
      request(model);
      return templates[model] ? acquireFrom(side, model) : acquireFrom(side, "standard");
    },
    hideAll,
    dispose: () => {
      disposed = true;
      forEachSlot((slot) => disposeMarineSlot(scene, slot));
      pools[0] = emptyPools();
      pools[1] = emptyPools();
    }
  };
};
