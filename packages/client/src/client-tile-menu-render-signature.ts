import type { TileMenuTab, TileMenuView } from "./client-types.js";

export const tileMenuRenderSignature = (view: TileMenuView, activeTab: TileMenuTab): string =>
  JSON.stringify({
    activeTab,
    title: view.title,
    subtitle: view.subtitle,
    subtitleHtml: view.subtitleHtml,
    statusText: view.statusText,
    statusTone: view.statusTone,
    tabs: view.tabs,
    ...(activeTab === "overview"
      ? {
          overviewKicker: view.overviewKicker,
          overviewLines: view.overviewLines
        }
      : activeTab === "actions"
        ? { actions: view.actions }
        : activeTab === "buildings"
          ? { buildings: view.buildings }
          : activeTab === "crystal"
            ? { crystal: view.crystal }
            : { progress: view.progress })
  });
