import type { Terrain, Tile } from "@border-empires/shared";

export type TileMenuOverviewIntroInput = {
  terrain: Terrain;
  ownerKind: "unclaimed" | "mine-frontier" | "mine-settled" | "ally" | "enemy";
  productionLabel?: string | undefined;
  resourceLabel?: string | undefined;
  isDockEndpoint?: boolean;
  hasTown?: boolean;
  ownershipState?: Tile["ownershipState"];
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
        "Unclaimed dock. Claim and annex this tile to plug it into your trade routes."
      ];
    }
    if (input.resourceLabel) {
      return [
        `Resource node: ${input.resourceLabel}. Claim and annex this tile to start producing ${input.productionLabel ?? input.resourceLabel.toLowerCase()}.`
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
          `Needs annexing to produce ${input.productionLabel}.`
        ]
      : [];
  }
  if (input.ownerKind === "ally" || input.ownerKind === "enemy") {
    if (input.ownershipState === "SETTLED") return ["Annexed territory."];
    if (input.ownershipState === "FRONTIER") return ["Frontier territory — not yet annexed."];
  }
  // Generic "what is frontier / settled land" copy lives in the header's
  // expandable ownership help (client-tile-menu-ownership-help), not here.
  return [];
};


export const foreignTileOwnershipLabel = (tile: Pick<Tile, "ownerId" | "ownershipState" | "terrain">, viewerId: string): string | undefined => {
  if (!tile.ownerId || tile.ownerId === viewerId || tile.terrain !== "LAND") return undefined;
  if (tile.ownershipState === "SETTLED") return "Annexed territory";
  if (tile.ownershipState === "FRONTIER") return "Frontier territory";
  return undefined;
};
