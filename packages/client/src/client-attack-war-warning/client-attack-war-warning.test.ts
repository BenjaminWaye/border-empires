// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { ClientState } from "../client-state/client-state.js";
import { hideEffortConfirmSheet } from "../client-effort-confirm-sheet/client-effort-confirm-sheet.js";
import { launchAttacksWithEffort, type AttackLaunchDeps } from "../client-launch-attack-effort/client-launch-attack-effort.js";
import type { Tile } from "../client-types.js";
import { attackWarWarning } from "./client-attack-war-warning.js";

// Playtest run 5: attacking a House with no pact started a war without a word on the attack confirm.

type Battle = ClientState["activeBattles"] extends Map<string, infer B> ? B : never;

const makeState = (): ClientState => {
  const state = createInitialState();
  state.me = "me";
  state.manpowerCap = 1_000;
  state.playerNames.set("ai-ash", "House Ashhaven");
  state.playerNames.set("ai-war", "House Henrik");
  state.playerNames.set("ai-truce", "House Rowan");
  state.activeTruces = [{ otherPlayerId: "ai-truce", endsAt: Date.now() + 3_600_000 } as ClientState["activeTruces"][number]];
  state.activeBattles.set("b1", { attackerOwnerId: "me", defenderOwnerId: "ai-war" } as unknown as Battle);
  return state;
};

describe("attackWarWarning", () => {
  it("names a House you have no pact with and aren't fighting yet", () => {
    expect(attackWarWarning(makeState(), ["ai-ash"], Date.now())).toBe("Starts war with House Ashhaven");
  });

  it("says nothing for a House already at war, a truce partner, barbarians or your own land", () => {
    const state = makeState();
    expect(attackWarWarning(state, ["ai-war", "ai-truce", "barbarian-1", "me", undefined], Date.now())).toBe("");
  });
});

describe("Launch Attack confirm", () => {
  afterEach(() => hideEffortConfirmSheet());

  const launch = (ownerId: string): string => {
    const state = makeState();
    state.tiles.set("0,0", { x: 0, y: 0, terrain: "LAND", ownerId: "me" } as Tile);
    state.tiles.set("1,0", { x: 1, y: 0, terrain: "LAND", ownerId, ownershipState: "SETTLED" } as Tile);
    const deps: AttackLaunchDeps = {
      keyFor: (x, y) => `${x},${y}`,
      pickOriginForTarget: () => state.tiles.get("0,0"),
      isTileOwnedByAlly: () => false,
      queueSpecificTargets: vi.fn((keys: string[]) => ({ queued: keys.length, skipped: 0, queuedKeys: keys })),
      processActionQueue: vi.fn(() => true),
      attackQueueFailureReason: () => "nope",
      pushFeed: vi.fn(),
      showCaptureAlert: vi.fn(),
      hideTileActionMenu: vi.fn()
    };
    launchAttacksWithEffort(state, { targetKeys: ["1,0"], scope: "single", selected: state.tiles.get("1,0") }, deps);
    return document.querySelector(".effort-confirm-subtitle")?.textContent ?? "";
  };

  it("warns when the attack starts a war", () => {
    expect(launch("ai-ash")).toBe("Starts war with House Ashhaven");
  });

  it("doesn't when you are already at war", () => {
    expect(launch("ai-war")).not.toContain("Starts war");
  });
});
