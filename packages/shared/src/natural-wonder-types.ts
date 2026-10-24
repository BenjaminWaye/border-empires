export type NaturalWonderType =
  | "FOUNDRY_HEART"
  | "DEEPWATER_ENGINE"
  | "CONSCRIPTION_ENGINE"
  | "WARPRESS"
  | "BASTION_FRAME"
  | "CALCULATING_ENGINE"
  | "QUICKFORGE"
  | "WATCHTOWER_ENGINE"
  | "CARTOGRAPHERS_LENS";

export type NaturalWonderState = {
  type: NaturalWonderType;
  claimedAt?: number;
  /** Versioned opt-in: old saved worlds keep their existing wonder rules. */
  relicVersion?: 1;
  remainingUses?: number;
  activatedAt?: number;
  resourceBonus?: { resource: import("./relics/relic-catalog.js").RelicResource; amount: number };
};
