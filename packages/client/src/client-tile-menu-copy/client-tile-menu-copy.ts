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
    return [];
  }
  if (input.ownerKind === "mine-frontier") {
    if (input.hasTown) {
      return input.resourceLabel ? [`Resource node: ${input.resourceLabel}.`] : [];
    }
    return input.productionLabel
      ? [
          ...(input.resourceLabel ? [`Resource node: ${input.resourceLabel}.`] : []),
          `Needs settlement to produce ${input.productionLabel}.`
        ]
      : [];
  }
  // Generic "what is frontier / settled land" copy lives in the header's
  // expandable ownership help (client-tile-menu-ownership-help), not here.
  return [];
};
