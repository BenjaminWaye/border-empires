import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";

export type EconomyPlayer = Pick<DomainPlayer, "id" | "techIds" | "domainIds" | "mods" | "wonderDockGoldMultiplier" | "afcUpgradeRuleset" | "afcCoreTownKeys" | "afcScarcityFoodSlots"> & { allies?: ReadonlySet<string> };

export type DockEconomyContext = {
  players?: ReadonlyMap<string, EconomyPlayer>;
  tiles: ReadonlyMap<string, DomainTileState>;
  dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>;
  // §5.4: dormant economicStructure tile keys ("x,y") for this player — see
  // hasSupportedStructure's matching param. Optional so existing callers
  // that haven't threaded it through yet default to "nothing dormant"
  // rather than a hard type error.
  dormantEconomicStructureKeys?: ReadonlySet<string>;
};
