// Town Coin depends on the share of the town's luxury biota need met
// (biota-town-output.ts), and the client reads it from the town tile's stamped
// goldPerMinute. The allocation can shift with no write to the town tile (a
// Vivarium or Estate on another tile, a trade, an older town growing), so the
// 60 s population tick re-pushes a town whose share differs from the share it
// was last pushed with. The map is transient per runtime: after a restart a
// short town is pushed once more, which is harmless. Bounded by town tiles.
import { biotaShareMet, type BiotaTownSupply } from "@border-empires/shared";

export type BiotaCoinRefresh = {
  /** True when this town's share changed since it was last pushed; records the new share. */
  changed: (tileKey: string, supply: BiotaTownSupply | undefined) => boolean;
};

const lastPushedByRuntime = new WeakMap<object, Map<string, number>>();

/** `owner` is any object that lives exactly as long as the runtime (its growth-tick map). */
export const biotaCoinRefreshFor = (owner: object): BiotaCoinRefresh => {
  let lastPushed = lastPushedByRuntime.get(owner);
  if (!lastPushed) {
    lastPushed = new Map();
    lastPushedByRuntime.set(owner, lastPushed);
  }
  const shares = lastPushed;
  return {
    changed: (tileKey, supply) => {
      const share = biotaShareMet(supply);
      if ((shares.get(tileKey) ?? 1) === share) return false;
      if (share === 1) shares.delete(tileKey); else shares.set(tileKey, share);
      return true;
    }
  };
};
