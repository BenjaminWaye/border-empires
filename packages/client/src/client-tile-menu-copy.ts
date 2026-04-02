export type TileMenuOverviewIntroInput = {
  terrain: "LAND" | "SEA" | "MOUNTAIN";
  ownerKind: "unclaimed" | "mine-frontier" | "mine-settled" | "ally" | "enemy";
  productionLabel?: string | undefined;
  isDockEndpoint?: boolean;
};

export const tileMenuSubtitleText = (ownerLabel: string, regionLabel?: string): string =>
  [ownerLabel, regionLabel ?? ""].filter(Boolean).join(" · ");

export const tileMenuOverviewIntroLines = (input: TileMenuOverviewIntroInput): string[] => {
  if (input.terrain === "SEA") {
    return [input.isDockEndpoint ? "Dock route endpoint." : "Sea tiles only support naval interactions."];
  }
  if (input.terrain === "MOUNTAIN") {
    return ["Mountains block normal land expansion and attacks."];
  }
  if (input.ownerKind === "unclaimed") {
    return [
      "Claim this tile first to turn it into frontier land.",
      ...(input.productionLabel ? [`After you settle it, this tile can produce ${input.productionLabel}.`] : [])
    ];
  }
  if (input.ownerKind === "mine-frontier") {
    return input.productionLabel
      ? ["Frontier land is visible control, but it has no real defense yet.", `Needs settlement to produce ${input.productionLabel}.`]
      : ["Frontier land is visible control, but it has no real defense yet.", "Needs settlement to gain defense and full ownership strength."];
  }
  if (input.ownerKind === "mine-settled") {
    return ["Settled land is defended and fully part of your empire."];
  }
  return [];
};
