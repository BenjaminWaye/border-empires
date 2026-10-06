import type { Tile } from "@border-empires/shared";

// The structure records a DomainTileState carries, extracted from index.ts (500-line cap).
// startedAt/completesAt bound the build window; pausedAt is stamped while an attack on the
// tile has paused construction (apps/simulation attack-development-hold.ts).

export type DomainFortState = {
  ownerId: string;
  status: NonNullable<Tile["fort"]>["status"];
  variant?: NonNullable<Tile["fort"]>["variant"] | undefined;
  upgradingFrom?: NonNullable<Tile["fort"]>["variant"] | undefined;
  completesAt?: number | undefined;
  startedAt?: number | undefined;
  pausedAt?: number | undefined; // attack-development-hold.ts: set while the tile is under attack
  activatedAt?: number | undefined;
  disabledUntil?: number | undefined;
  previousStatus?: "active" | undefined;
};

export type DomainObservatoryState = {
  ownerId: string;
  status: NonNullable<Tile["observatory"]>["status"];
  completesAt?: number | undefined;
  startedAt?: number | undefined;
  pausedAt?: number | undefined; // attack-development-hold.ts: set while the tile is under attack
  activatedAt?: number | undefined;
  cooldownUntil?: number | undefined;
  previousStatus?: "active" | "inactive" | undefined;
  // Siphon mode (docs/game-mechanics.md "Siphon"): set while this tower is draining a Siphon target.
  siphon?: import("@border-empires/shared").ObservatorySiphonMode | undefined;
};

export type DomainSiegeOutpostState = {
  ownerId: string;
  status: NonNullable<Tile["siegeOutpost"]>["status"];
  variant?: NonNullable<Tile["siegeOutpost"]>["variant"] | undefined;
  completesAt?: number | undefined;
  startedAt?: number | undefined;
  pausedAt?: number | undefined; // attack-development-hold.ts: set while the tile is under attack
  activatedAt?: number | undefined;
  previousStatus?: "active" | undefined;
};

export type DomainEconomicStructureState = {
  ownerId: string;
  type: NonNullable<Tile["economicStructure"]>["type"];
  status: NonNullable<Tile["economicStructure"]>["status"];
  completesAt?: number | undefined;
  startedAt?: number | undefined;
  pausedAt?: number | undefined; // attack-development-hold.ts: set while the tile is under attack
  activatedAt?: number | undefined;
  disabledUntil?: number | undefined;
  nextUpkeepAt?: number | undefined;
  inactiveReason?: NonNullable<Tile["economicStructure"]>["inactiveReason"] | undefined;
  previousStatus?: "active" | "inactive" | undefined;
  bombardCooldownUntil?: number | undefined;
  converterMode?: NonNullable<Tile["economicStructure"]>["converterMode"];
  modeLockedUntil?: NonNullable<Tile["economicStructure"]>["modeLockedUntil"];
};
