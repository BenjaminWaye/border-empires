import { describe, expect, it, vi } from "vitest";

import { syncBattleOverlayFx } from "../client-map-3d-capture-overlays.js";
import type { BattleOverlaySkirmishEntry } from "../client-map-3d-battle-overlay-fx.js";
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
    capture: undefined,
    ...overrides
  }) as unknown as ClientState;

const skirmishesFrom = (state: ClientState): BattleOverlaySkirmishEntry[] => {
  const { fx, tick } = createFx();
  syncBattleOverlayFx(state, keyFor, heightfield, (ownerId: string) => `#${ownerId}`, fx, 1234);
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
            startAt: 1000, clashAt: 1000, endAt: 9999
          }
        ]
      ])
    });

    expect(skirmishesFrom(state)).toHaveLength(0);
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
