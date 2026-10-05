import type { FortVariant } from "@border-empires/shared";

// The client's view of a tile's fortification: a Palisade or any Fort tier.
export type ClientTileFort = {
  ownerId: string;
  status: "under_construction" | "active" | "removing";
  variant?: FortVariant;
  // Set while an upgrade is under_construction: the tier still standing.
  upgradingFrom?: FortVariant;
  completesAt?: number;
  // Construction is on hold (tile under attack); remaining time is frozen at this instant.
  pausedAt?: number;
  disabledUntil?: number;
};
