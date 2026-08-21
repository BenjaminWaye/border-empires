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
};
