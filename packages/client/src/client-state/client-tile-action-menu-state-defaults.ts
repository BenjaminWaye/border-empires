import type { TileMenuTab } from "../client-types.js";

export type TileActionMenuState = {
  visible: boolean;
  x: number;
  y: number;
  mode: "single" | "bulk";
  bulkKeys: string[];
  currentTileKey: string;
  activeTab: TileMenuTab;
  scrollTopByTab: Partial<Record<TileMenuTab, number>>;
  renderSignature: string;
  /**
   * Set when the menu was opened by tapping one of an own AFC's arm tiles:
   * the 0-based module socket on that arm. `seq` changes per tap so the HUD
   * can reopen the Modules sheet for a repeat tap on the same AFC.
   */
  afcArmFocus?: { socket: number; seq: number } | undefined;
};

// Default tile action menu state, extracted out of client-state.ts (already
// over the repo's 500-line file cap — see AGENTS.md's file-line-limit rule).
export const createInitialTileActionMenuState = (): TileActionMenuState => ({
  visible: false,
  x: 0,
  y: 0,
  mode: "single",
  bulkKeys: [],
  currentTileKey: "",
  activeTab: "overview",
  scrollTopByTab: {},
  renderSignature: ""
});
