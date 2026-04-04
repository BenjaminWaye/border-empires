import type { TileMenuTab } from "./client-types.js";

export type TileMenuScrollMemory = {
  activeTab: TileMenuTab;
  scrollTopByTab: Partial<Record<TileMenuTab, number>>;
};

export const rememberTileMenuScrollTop = (
  memory: TileMenuScrollMemory,
  scrollTop: number
): Partial<Record<TileMenuTab, number>> => ({
  ...memory.scrollTopByTab,
  [memory.activeTab]: Math.max(0, scrollTop)
});

export const restoreTileMenuScrollTop = (
  scrollTopByTab: Partial<Record<TileMenuTab, number>>,
  activeTab: TileMenuTab
): number => Math.max(0, scrollTopByTab[activeTab] ?? 0);
