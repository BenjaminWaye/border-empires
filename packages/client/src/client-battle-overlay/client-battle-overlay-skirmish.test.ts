import { describe, expect, it, vi } from "vitest";

import { syncBattleOverlayFx } from "../client-map-3d-capture-overlays.js";
import type { BattleOverlaySkirmishEntry } from "../client-map-3d-popup-marine/popup-marine-timeline.js";
import type { ClientState } from "../client-state/client-state.js";

const keyFor = (x: number, y: number) => `${x},${y}`;

const heightfield = { elevationAt: () => 0, cornerYAt: () => 0 } as never;

const createFx = () => {
  const tick = vi.fn<(nowMs: number, battles: unknown[], skirmishes?: BattleOverlaySkirmishEntry[]) => void>();
  return { fx: { tick, clear: vi.fn(), dispose: vi.fn() } as never, tick };
};

const createState = (overrides: Partial<ClientState>): ClientState =>
  ({
    me: "me",
    camX: 0,
    camY: 0,
    tiles: new Map(),
    activeBattles: new Map(),
    incomingAttacksByTile: new Map(),
    outgoingMusterAttacksByTile: new Map(),
    skirmishSeenAt: new Map(),
    capture: undefined,
    ...overrides
  }) as unknown as ClientState;

const skirmishesFrom = (state: ClientState): BattleOverlaySkirmishEntry[] => {
  const { fx, tick } = createFx();
  syncBattleOverlayFx(state, keyFor, heightfield, (ownerId: string) => `#${ownerId}`, fx, 1234, state.camX, state.camY);
  return tick.mock.calls[0]?.[2] ?? [];
};

describe("battle overlay skirmish sourcing", () => {
  const target = { x: 5, y: 5, terrain: "LAND", ownerId: "victim", fogged: false } as never;

  it("renders a skirmish for the whole countdown when defending", () => {
    const state = createState({
      me: "victim",
      tiles: new Map([["5,5", target]]),
      incomingAttacksByTile: new Map([
        ["5,5", { attackerName: "Rival", resolvesAt: Date.now() + 25_000, attackerId: "rival-1", fromX: 4, fromY: 5 }]
      ])
    });

    const skirmishes = skirmishesFrom(state);

    expect(skirmishes).toHaveLength(1);
    expect(skirmishes[0]).toEqual(expect.objectContaining({ attackerColor: "#rival-1", defenderColor: "#victim" }));
  });

  it("stops rendering a defended tile once its countdown has elapsed", () => {
    // Regression: resolvesAt is server epoch ms but the render loop ticks in
    // performance.now(), so this comparison used to be made against page
    // uptime and never fired.
    const state = createState({
      me: "victim",
      tiles: new Map([["5,5", target]]),
      incomingAttacksByTile: new Map([
        ["5,5", { attackerName: "Rival", resolvesAt: Date.now() - 1_000, attackerId: "rival-1", fromX: 4, fromY: 5 }]
      ])
    });

    expect(skirmishesFrom(state)).toHaveLength(0);
  });

  // The server addresses ATTACK_ALERT to the defender only, so the attacker's
  // own outgoing fight never reaches incomingAttacksByTile and used to show no
  // dots at all until the ~2.3s resolution flourish.
  it("renders a skirmish for the whole countdown when attacking", () => {
    const state = createState({
      me: "me",
      tiles: new Map([["5,5", target]]),
      capture: { startAt: 0, resolvesAt: Date.now() + 25_000, target: { x: 5, y: 5 }, origin: { x: 4, y: 5 }, actionType: "ATTACK" }
    });

    const skirmishes = skirmishesFrom(state);

    expect(skirmishes).toHaveLength(1);
    expect(skirmishes[0]).toEqual(expect.objectContaining({ attackerColor: "#me", defenderColor: "#victim" }));
  });

  // Regression coverage for the muster flag advance-attack animation bug
  // report: a muster flag's ADVANCE-mode auto-fire attack never occupies the
  // single-slot `capture` field (the server dispatches it without this
  // client submitting anything), so it used to render no skirmish at all —
  // only the ~2.3s resolution flourish once combat resolved.
  it("renders a skirmish for a muster flag's auto-fired attack", () => {
    const state = createState({
      me: "me",
      tiles: new Map([["5,5", target]]),
      outgoingMusterAttacksByTile: new Map([
        ["5,5", { originX: 4, originY: 5, targetX: 5, targetY: 5, resolvesAt: Date.now() + 25_000 }]
      ])
    });

    const skirmishes = skirmishesFrom(state);

    expect(skirmishes).toHaveLength(1);
    expect(skirmishes[0]).toEqual(expect.objectContaining({ attackerColor: "#me", defenderColor: "#victim" }));
  });

  it("renders the muster flag's own skirmish even when the target tile is still unexplored", () => {
    const state = createState({
      me: "me",
      tiles: new Map(), // target tile never loaded client-side
      outgoingMusterAttacksByTile: new Map([
        ["5,5", { originX: 4, originY: 5, targetX: 5, targetY: 5, resolvesAt: Date.now() + 25_000 }]
      ])
    });

    const skirmishes = skirmishesFrom(state);

    expect(skirmishes).toHaveLength(1);
    expect(skirmishes[0]).toEqual(expect.objectContaining({ attackerColor: "#me" }));
    expect(skirmishes[0]?.defenderColor).not.toBe("#me");
  });

  it("stops rendering a muster flag's attack once its countdown has elapsed", () => {
    const state = createState({
      me: "me",
      tiles: new Map([["5,5", target]]),
      outgoingMusterAttacksByTile: new Map([
        ["5,5", { originX: 4, originY: 5, targetX: 5, targetY: 5, resolvesAt: Date.now() - 1 }]
      ])
    });

    expect(skirmishesFrom(state)).toHaveLength(0);
  });

  // Regression: an ADVANCE-mode muster flag fires autonomously against
  // whatever the server's own search finds nearest, which can be a tile this
  // client has never had vision of (a manual attack is almost always against
  // a tile the player is currently looking at, so it's normally already
  // loaded). Requiring a known ownerId here used to silently skip the
  // attacker's own skirmish for the entire countdown, only for it to appear
  // once the resolution broadcast finally reveals the tile.
  it("renders the attacker's own skirmish even when the target tile is still unexplored", () => {
    const state = createState({
      me: "me",
      tiles: new Map(), // target tile never loaded client-side
      capture: { startAt: 0, resolvesAt: Date.now() + 25_000, target: { x: 5, y: 5 }, origin: { x: 4, y: 5 }, actionType: "ATTACK" }
    });

    const skirmishes = skirmishesFrom(state);

    expect(skirmishes).toHaveLength(1);
    expect(skirmishes[0]).toEqual(expect.objectContaining({ attackerColor: "#me" }));
    expect(skirmishes[0]?.defenderColor).not.toBe("#me");
  });

  it("renders no skirmish for an EXPAND onto neutral land", () => {
    const state = createState({
      me: "me",
      tiles: new Map([["5,5", { x: 5, y: 5, terrain: "LAND", fogged: false } as never]]),
      capture: { startAt: 0, resolvesAt: Date.now() + 25_000, target: { x: 5, y: 5 }, origin: { x: 4, y: 5 }, actionType: "EXPAND" }
    });

    expect(skirmishesFrom(state)).toHaveLength(0);
  });

  it("yields to the resolved-battle animation once the outcome broadcast lands", () => {
    const state = createState({
      me: "me",
      tiles: new Map([["5,5", target]]),
      capture: { startAt: 0, resolvesAt: Date.now() + 25_000, target: { x: 5, y: 5 }, origin: { x: 4, y: 5 }, actionType: "ATTACK" },
      activeBattles: new Map([
        [
          "5,5",
          {
            originX: 4, originY: 5, targetX: 5, targetY: 5,
            attackerOwnerId: "me", defenderOwnerId: "victim", attackerWon: true,
            startAt: 1000, clashAt: 1000, endAt: 9999, fromSkirmish: true
          }
        ]
      ])
    });

    expect(skirmishesFrom(state)).toHaveLength(0);
  });

  it("stamps a stable skirmishSeenAt on first render and reuses it on later ticks", () => {
    // registerActiveBattleFromTileDelta (client-battle-overlay.ts) reads this
    // timestamp to continue the skirmish's approach trajectory once the
    // resolution broadcast lands, instead of restarting it.
    const state = createState({
      me: "victim",
      tiles: new Map([["5,5", target]]),
      incomingAttacksByTile: new Map([
        ["5,5", { attackerName: "Rival", resolvesAt: Date.now() + 25_000, attackerId: "rival-1", fromX: 4, fromY: 5 }]
      ])
    });

    const { fx } = createFx();
    syncBattleOverlayFx(state, keyFor, heightfield, (ownerId: string) => `#${ownerId}`, fx, 1000, state.camX, state.camY);
    expect(state.skirmishSeenAt.get("5,5")).toBe(1000);

    syncBattleOverlayFx(state, keyFor, heightfield, (ownerId: string) => `#${ownerId}`, fx, 1500, state.camX, state.camY);
    expect(state.skirmishSeenAt.get("5,5")).toBe(1000);
  });

  it("keeps skirmishSeenAt alive through the resolvesAt-to-broadcast gap", () => {
    // Regression: pushSkirmish stops firing for a tile the instant its
    // resolvesAt passes, but the resolution broadcast reliably lands a beat
    // later. Pruning skirmishSeenAt off of "was a skirmish drawn this exact
    // frame" (rather than "does incomingAttacksByTile still reference this
    // tile") would wipe the timestamp during that gap, forcing the eventual
    // resolved battle to restart its approach instead of continuing it.
    const state = createState({
      me: "victim",
      tiles: new Map([["5,5", target]]),
      incomingAttacksByTile: new Map([
        ["5,5", { attackerName: "Rival", resolvesAt: Date.now() + 100, attackerId: "rival-1", fromX: 4, fromY: 5 }]
      ])
    });

    const { fx } = createFx();
    syncBattleOverlayFx(state, keyFor, heightfield, (ownerId: string) => `#${ownerId}`, fx, 1000, state.camX, state.camY);
    const seenAt = state.skirmishSeenAt.get("5,5");
    expect(seenAt).toBeDefined();

    // resolvesAt has now passed server-side, but the tile delta carrying the
    // resolution hasn't arrived yet — incomingAttacksByTile is untouched.
    state.incomingAttacksByTile.set("5,5", {
      attackerName: "Rival", resolvesAt: Date.now() - 50, attackerId: "rival-1", fromX: 4, fromY: 5
    });
    syncBattleOverlayFx(state, keyFor, heightfield, (ownerId: string) => `#${ownerId}`, fx, 2000, state.camX, state.camY);

    expect(state.skirmishSeenAt.get("5,5")).toBe(seenAt);
  });

  it("does not double-render a tile the player is both attacking and alerted about", () => {
    const state = createState({
      me: "me",
      tiles: new Map([["5,5", target]]),
      incomingAttacksByTile: new Map([
        ["5,5", { attackerName: "Me", resolvesAt: Date.now() + 25_000, attackerId: "me", fromX: 4, fromY: 5 }]
      ]),
      capture: { startAt: 0, resolvesAt: Date.now() + 25_000, target: { x: 5, y: 5 }, origin: { x: 4, y: 5 }, actionType: "ATTACK" }
    });

    expect(skirmishesFrom(state)).toHaveLength(1);
  });
});
