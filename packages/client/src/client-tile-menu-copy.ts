import type { Terrain } from "@border-empires/shared";

export type TileMenuOverviewIntroInput = {
  terrain: Terrain;
  ownerKind: "unclaimed" | "mine-frontier" | "mine-settled" | "ally" | "enemy";
  productionLabel?: string | undefined;
  resourceLabel?: string | undefined;
  isDockEndpoint?: boolean;
  hasTown?: boolean;
};

export const tileMenuSubtitleText = (ownerLabel: string, regionLabel?: string): string =>
  [ownerLabel, regionLabel ?? ""].filter(Boolean).join(" · ");

export const tileMenuOverviewIntroLines = (input: TileMenuOverviewIntroInput): string[] => {
  if (input.terrain === "SEA" || input.terrain === "COASTAL_SEA") {
    return [input.isDockEndpoint ? "Dock route endpoint." : "Sea tiles only support naval interactions."];
  }
  if (input.terrain === "MOUNTAIN") {
    return ["Mountains block normal land expansion and attacks."];
  }
  if (input.ownerKind === "unclaimed") {
    if (input.hasTown) {
      return input.resourceLabel ? [`Resource node: ${input.resourceLabel}.`] : [];
    }
    if (input.isDockEndpoint) {
      return [
        ...(input.resourceLabel ? [`Resource node: ${input.resourceLabel}.`] : []),
        "Unclaimed dock. Claim and settle this tile to plug it into your trade routes."
      ];
    }
    if (input.resourceLabel) {
      return [
        `Resource node: ${input.resourceLabel}. Claim and settle this tile to start producing ${input.productionLabel ?? input.resourceLabel.toLowerCase()}.`
      ];
    }
    return ["Claim this tile first to turn it into frontier land."];
  }
  if (input.ownerKind === "mine-frontier") {
    if (input.hasTown) {
      return input.resourceLabel ? [`Resource node: ${input.resourceLabel}.`] : [];
    }
    return input.productionLabel
      ? [
          ...(input.resourceLabel ? [`Resource node: ${input.resourceLabel}.`] : []),
          "Frontier land is visible control, but it has no real defense yet.",
          `Needs settlement to produce ${input.productionLabel}.`
        ]
      : ["Frontier land is visible control, but it has no real defense yet.", "Needs settlement to gain defense and full ownership strength."];
  }
  if (input.ownerKind === "mine-settled") {
    return ["Settled land is defended and fully part of your empire."];
  }
  return [];
};
