import type { CosmeticId, PlayerCosmeticSelection } from "@border-empires/shared";
import { describe, expect, it, vi } from "vitest";

import type { ClientState } from "../client-state/client-state.js";
import type { EmpireVisualStyle } from "../client-types.js";
import { applyInitPlayerStyles, applyPlayerAppearanceMessage } from "../client-player-style-message/client-player-style-message.js";
import { captureMap3DRebuildTriggers, map3DRebuildTriggersChanged } from "./client-map-3d-rebuild-triggers.js";

// Review finding (PR #3022): a PLAYER_STYLE crest change updated state but
// the true-3D map never rebuilt, so muster banners kept the old crest (and a
// High-noble flag its old look) until an unrelated pan or tile change.

const keyFor = (x: number, y: number): string => `${x},${y}`;

const createState = () => ({
  me: "me",
  meName: "Me",
  playerNames: new Map<string, string>(),
  playerColors: new Map<string, string>(),
  playerVisualStyles: new Map<string, EmpireVisualStyle>(),
  playerShieldUntil: new Map<string, number>(),
  playerCosmetics: new Map<string, PlayerCosmeticSelection>(),
  ownedCosmetics: [] as CosmeticId[],
  cosmeticsRequested: false,
  dukePlayers: new Set<string>(),
  outgoingMusterAttacksByTile: new Map(),
  incomingAttacksByTile: new Map(),
  capture: undefined,
  tiles: new Map(),
  crystalTargeting: { active: false, ability: "aether_bridge", validTargets: new Set(), originByTarget: new Map() },
  serverReach: undefined,
  serverReachRevision: 0,
  selected: undefined,
  tileActionMenu: { visible: false, x: 0, y: 0, mode: "single", bulkKeys: [], currentTileKey: "", activeTab: "overview", scrollTopByTab: {}, renderSignature: "" },
  allies: [],
  dormantStructures: [],
  aetherShieldTowers: undefined,
  techIds: [],
  techCatalog: [],
  showDiplomacyOverlay: false,
  showResourceOverlay: false,
  activeTruces: []
});

const capture = (state: ReturnType<typeof createState>) => captureMap3DRebuildTriggers(state as unknown as ClientState, keyFor, true);

const playerStyle = (state: ReturnType<typeof createState>, playerId: string, cosmetics: PlayerCosmeticSelection): void => {
  applyPlayerAppearanceMessage({ type: "PLAYER_STYLE", playerId, cosmetics }, {
    state, authProfileNameEl: { value: "" }, authProfileColorEl: { value: "" }, syncAuthOverlay: vi.fn(), renderHud: vi.fn()
  });
};

describe("3D map rebuild on cosmetics changes", () => {
  it("rebuilds when a rival's crest changes, and not for a PLAYER_STYLE that changes no look", () => {
    const state = createState();
    const built = capture(state);
    playerStyle(state, "rival", { crest: "crest-kraken" });
    const afterCrest = capture(state);
    expect(map3DRebuildTriggersChanged(built, afterCrest)).toBe(true);
    playerStyle(state, "rival", { crest: "crest-kraken" });
    expect(map3DRebuildTriggersChanged(afterCrest, capture(state))).toBe(false);
  });

  it("rebuilds when a muster flag cosmetic changes or is cleared", () => {
    const state = createState();
    const built = capture(state);
    playerStyle(state, "rival", { musterFlag: "flag-high-noble" });
    const shown = capture(state);
    expect(map3DRebuildTriggersChanged(built, shown)).toBe(true);
    playerStyle(state, "rival", {});
    expect(map3DRebuildTriggersChanged(shown, capture(state))).toBe(true);
  });

  it("rebuilds after INIT replaces the looks", () => {
    const state = createState();
    playerStyle(state, "rival", { crest: "crest-key" });
    const built = capture(state);
    applyInitPlayerStyles(state, { playerStyles: [], playerCosmetics: { other: { crest: "crest-stag" } } });
    expect(map3DRebuildTriggersChanged(built, capture(state))).toBe(true);
  });
});
