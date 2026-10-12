import type { TileMenuTab } from "../client-types.js";

export const tileMenuTabs = (input: { progress: boolean; actions: boolean; buildings: boolean; crystal: boolean; commit: boolean; modules: boolean }): TileMenuTab[] => {
  const tabs: TileMenuTab[] = [];
  if (input.progress) tabs.push("progress");
  if (input.modules) tabs.push("modules");
  if (input.actions) tabs.push("actions");
  if (input.buildings) tabs.push("buildings");
  if (input.crystal) tabs.push("crystal");
  if (input.commit) tabs.push("commit");
  tabs.push("overview");
  return tabs;
};
