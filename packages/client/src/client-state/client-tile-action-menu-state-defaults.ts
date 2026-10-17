import type { TileMenuTab } from "../client-types.js";

// Default tile action menu state, extracted out of client-state.ts (already
// over the repo's 500-line file cap — see AGENTS.md's file-line-limit rule).
export const createInitialTileActionMenuState = () => ({
  visible: false,
  x: 0,
  y: 0,
  mode: "single" as "single" | "bulk",
  bulkKeys: [] as string[],
  currentTileKey: "",
  activeTab: "overview" as TileMenuTab,
  scrollTopByTab: {} as Partial<Record<TileMenuTab, number>>,
  renderSignature: ""
});
