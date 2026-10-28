import type { ResourceSupplyPlayerState } from "@border-empires/shared";
import type { ResourceSlotDormancy } from "../resource-slot-view/resource-slot-view.js";
/** One derived projection in an existing per-player economy cache cell. */
export type ResourceSupplyProjectionCache = {
  dormancy: ResourceSlotDormancy | undefined;
  state: ResourceSupplyPlayerState;
};
