import type { TileActionDef } from "../client-types.js";

export const tileActionAvailability = (
  enabled: boolean,
  reason: string,
  cost?: string
): Pick<TileActionDef, "disabled" | "disabledReason" | "cost"> => {
  if (enabled) return cost ? { disabled: false, cost } : { disabled: false };
  return cost ? { disabled: true, disabledReason: reason, cost } : { disabled: true, disabledReason: reason };
};

