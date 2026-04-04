import type { TileMenuTab, TileMenuView } from "./client-types.js";

export const tileMenuRenderSignature = (view: TileMenuView, activeTab: TileMenuTab): string =>
  JSON.stringify({
    activeTab,
    title: view.title,
    subtitle: view.subtitle,
    tabs: view.tabs,
    overviewKicker: view.overviewKicker,
    overviewLines: view.overviewLines,
    actions: view.actions,
    buildings: view.buildings,
    crystal: view.crystal,
    progress: view.progress
  });
