import type { Meta, StoryObj } from "@storybook/html-vite";
import { Color } from "three";
import { createBarbarianOverlay } from "@client/client-map-3d-barbarian-overlay.js";
import { createBarbarianLossOverlay, type BarbarianLossBattle } from "@client/client-map-3d-barbarian-loss-overlay.js";
import { createOwnershipOverlay } from "@client/client-map-3d-ownership-overlay.js";
import { createBarbarianFrontierTintTracker, observeBarbarianFrontierTint } from "@client/client-map-3d-barbarian-frontier-tint.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

// Five end-to-end reviews of the barbarian ("The Bleed", in player-facing
// text — see client-owner-name.ts et al.) capture visualization, each
// driving the SAME clear/addInstance/commit/tick shape the real map render
// loop uses (client-map-3d.ts). All five share one scene builder,
// parameterized by what the captured tile was and who ends up owning it.
//
// Notably this story does NOT drive any battle-FX itself: both
// createBarbarianOverlay (the win case, via its "fighting" phase) and
// createBarbarianLossOverlay (the loss case) own and tick their own
// defender-only marine skirmish internally
// (client-map-3d-colossus-marine-skirmish.ts) — ticking those two overlays
// is enough to see the real lasers-hit-the-colossus / colossus-kills-
// marines-one-by-one / colossus-dissolves-on-a-loss visuals exactly as they
// render in the live game.
const BARBARIAN_COLOR = new Color("#6a3fa0");
const PLAYER_TOWN_COLOR = new Color("#c98a3c");
const BARBARIAN_DEN_COLOR = new Color("#4a2f66");
const PLAYER_FRONTIER_COLOR = new Color("#3f7fa0");
const NEUTRAL_COLOR = new Color("#2c2f26");

const ORIGIN = { wx: 0, wy: 0 };
const TARGET = { wx: 1, wy: 0 };
const ALL_TILES = [
  { wx: -1, wy: -1 }, { wx: 0, wy: -1 }, { wx: 1, wy: -1 }, { wx: 2, wy: -1 },
  { wx: -1, wy: 0 }, ORIGIN, TARGET, { wx: 2, wy: 0 },
  { wx: -1, wy: 1 }, { wx: 0, wy: 1 }, { wx: 1, wy: 1 }, { wx: 2, wy: 1 }
];

type Scenario = "attack-settled-and-win" | "den-to-den" | "killed-by-player" | "takes-player-frontier" | "attacks-and-loses";

type Args = { cameraDistance: number; cycleMs: number; captureAtFraction: number; scenario: Scenario };

const SCENARIO_TARGET_COLOR: Record<Scenario, Color> = {
  "attack-settled-and-win": PLAYER_TOWN_COLOR,
  "den-to-den": BARBARIAN_DEN_COLOR,
  "killed-by-player": BARBARIAN_COLOR, // irrelevant -- this scenario recolors ORIGIN, not TARGET
  "takes-player-frontier": PLAYER_FRONTIER_COLOR,
  "attacks-and-loses": PLAYER_TOWN_COLOR // never actually changes -- the attack fails, the tile stays the defender's
};

// Both directions the Bleed can lose a fight render through the SAME real
// overlay (client-map-3d-barbarian-loss-overlay.ts's buildBarbarianLossBattles
// is symmetric: barbarianAttackerLost OR barbarianDefenderLost) --
// "attacks-and-loses" is the Bleed attacking and failing, "killed-by-player"
// is a player attacking a barbarian tile and winning. Visually they're
// identical (colossus appears at the fought-over tile, defender-only
// skirmish fires on it, it dissolves into blue smoke) -- what differs is
// WHICH tile the battle is at and what ownership does afterward.
const isLossScenario = (scenario: Scenario): boolean => scenario === "attacks-and-loses" || scenario === "killed-by-player";

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, cameraTilt: 0.85, background: "#161a12" });

  const ownershipOverlay = createOwnershipOverlay(stage.scene, ALL_TILES.length);
  const barbarianOverlay = createBarbarianOverlay(stage.scene, ALL_TILES.length);
  // Real production overlay (client-map-3d-barbarian-loss-overlay.ts) --
  // previews the actual shipped colossus-dissolves-into-blue-smoke death
  // (plus its own internal defender-only marine skirmish), not a demo
  // approximation, for BOTH loss directions.
  const lossOverlay = isLossScenario(args.scenario) ? createBarbarianLossOverlay(stage.scene) : undefined;
  let lossBattleKey: string | undefined;
  // Real production tracker (client-map-3d-barbarian-frontier-tint.ts) --
  // used here exactly as client-map-3d.ts wires it, so this story previews
  // the actual shipped tint-expansion effect, not a demo approximation.
  const frontierTint = createBarbarianFrontierTintTracker();

  const disposers: Array<() => void> = [ownershipOverlay.dispose, barbarianOverlay.dispose, () => lossOverlay?.dispose()];

  let cycleStart = performance.now();
  const captureAtMs = args.cycleMs * args.captureAtFraction;

  let rafId = 0;
  const animate = (): void => {
    const now = performance.now();
    if (now - cycleStart >= args.cycleMs) {
      cycleStart = now;
      lossBattleKey = undefined;
    }
    const elapsed = now - cycleStart;
    const captured = elapsed >= captureAtMs;

    // No walk telemetry exists for a RESOLVED battle in the real game (see
    // client-map-3d-barbarian-loss-overlay.ts's header) -- the fight is
    // already at the firing line the moment it's observed, not after a
    // walk, for either loss direction.
    if (lossOverlay && elapsed >= captureAtMs && !lossBattleKey) lossBattleKey = "loss-demo";
    if (lossOverlay) {
      const battles = new Map<string, BarbarianLossBattle>();
      if (lossBattleKey) {
        const endAt = cycleStart + captureAtMs + 3600; // clash + rout window, see FIGHT_DURATION_MS-adjacent timing in the overlay
        // "attacks-and-loses": the Bleed is the attacker, so the fight (and
        // its own death) plays out at the tile it was attacking (TARGET).
        // "killed-by-player": the Bleed is the defender, so the fight is at
        // its OWN tile (ORIGIN) -- there's nothing at TARGET at all.
        const battleTile = args.scenario === "killed-by-player" ? ORIGIN : TARGET;
        if (now < endAt) battles.set(lossBattleKey, { targetWorldX: battleTile.wx, targetWorldZ: battleTile.wy, surfaceY: 0, endAt });
      }
      lossOverlay.sync(battles, now);
      lossOverlay.tick(now);
    }

    ownershipOverlay.clear();
    barbarianOverlay.clear();
    frontierTint.reset(now);

    for (const tile of ALL_TILES) {
      const isOrigin = tile.wx === ORIGIN.wx && tile.wy === ORIGIN.wy;
      const isTarget = tile.wx === TARGET.wx && tile.wy === TARGET.wy;

      // "killed-by-player": the ORIGIN tile itself flips to a player, with
      // no adjacent barbarian gain -- the colossus's slot just frees (see
      // freeSlot() in client-map-3d-barbarian-overlay.ts), it doesn't walk
      // anywhere. "attacks-and-loses": ownership NEVER changes at all --
      // that's the whole point (a lost attack has no tile-ownership signal
      // to diff; see client-map-3d-barbarian-loss-overlay.ts). Every other
      // scenario captures TARGET from ORIGIN.
      const isBarbarian =
        args.scenario === "killed-by-player"
          ? isOrigin && !captured
          : args.scenario === "attacks-and-loses"
            ? isOrigin
            : (isOrigin && !captured) || (isTarget && captured);
      const isSettledTarget = args.scenario === "attack-settled-and-win" || args.scenario === "den-to-den" || args.scenario === "attacks-and-loses";

      // "killed-by-player": a player defeating a barbarian SETTLED tile
      // does NOT hand them an instant settled town -- runtime-lock-
      // resolution.ts's ownershipState assignment always lands a non-
      // barbarian capture as FRONTIER (only barbarian-1 itself resolves
      // straight to SETTLED; anchor structures may later auto-settle on
      // their own timer, which is a separate later process, not this).
      // ORIGIN recolors to the player's frontier color, not a town color.
      let fillColor = NEUTRAL_COLOR;
      if (isBarbarian) fillColor = BARBARIAN_COLOR;
      else if (isTarget && args.scenario !== "killed-by-player") fillColor = SCENARIO_TARGET_COLOR[args.scenario];
      else if (isOrigin && args.scenario === "killed-by-player" && captured) fillColor = PLAYER_FRONTIER_COLOR;

      // (ORIGIN is never TARGET, so this already reads as FRONTIER for the
      // "killed-by-player" recolor above without any extra casing here.)
      const isFrontierBucket = !isBarbarian && !(isTarget && isSettledTarget);
      const x0 = tile.wx - 0.5, x1 = tile.wx + 0.5, z0 = tile.wy - 0.5, z1 = tile.wy + 0.5;

      const tileKey = `${tile.wx},${tile.wy}`;
      const transition =
        args.scenario === "takes-player-frontier"
          ? observeBarbarianFrontierTint(frontierTint, isBarbarian ? "barbarian-1" : undefined, isFrontierBucket ? "FRONTIER" : "SETTLED", tileKey, fillColor)
          : undefined;

      const index = ownershipOverlay.addTile(x0, 0.001, z0, x1, 0.001, z0, x0, 0.001, z1, x1, 0.001, z1, fillColor, isFrontierBucket);
      if (transition && index >= 0) frontierTint.track(index, false, transition);

      if (isBarbarian) {
        barbarianOverlay.addInstance(tileKey, tile.wx, tile.wy, 0, tile.wx, tile.wy, isSettledTarget && isTarget);
      }
    }
    ownershipOverlay.commit();
    barbarianOverlay.commit();
    // Ticking this is enough to see the real Attack animation AND the real
    // defender-only marine skirmish (lasers hitting the colossus, marines
    // dying one by one) once a slot enters its "fighting" phase -- no
    // battle-FX wiring needed in this story at all.
    barbarianOverlay.tick(now);
    frontierTint.render(now, ownershipOverlay);

    rafId = requestAnimationFrame(animate);
  };
  animate();
  disposers.push(() => cancelAnimationFrame(rafId));

  return wrapWithCleanup(stage, disposers);
};

const meta: Meta<Args> = {
  title: "3D Library/VoidcrystalColossusExpansion",
  parameters: {
    docs: {
      description: {
        component:
          "Barbarian ('The Bleed', in player-facing text) tile capture, end to end, across the five cases that actually occur: " +
          "fighting and winning a settled town, expanding from one settled tile to another, being killed by a player with no " +
          "successor tile, eating a player's frontier land (same treatment as eating neutral land, including the real " +
          "tint-expansion fade-in — client-map-3d-barbarian-frontier-tint.ts), and attacking a settled tile and LOSING (a real " +
          "possible outcome — frontier-combat.ts's rollFrontierCombat is a probabilistic roll, not a guaranteed win). The two " +
          "fight scenarios show the real defender-only marine skirmish (client-map-3d-colossus-marine-skirmish.ts): marines " +
          "fire lasers that hit the colossus with an impact spark, and either the colossus kills them one by one (a win) or " +
          "they hold the whole time while the colossus itself dissolves (a loss)."
      }
    }
  },
  argTypes: {
    cameraDistance: { control: { type: "range", min: 4, max: 20, step: 1 } },
    cycleMs: { control: { type: "range", min: 2000, max: 20000, step: 250 } },
    captureAtFraction: { control: { type: "range", min: 0.05, max: 0.9, step: 0.01 } },
    scenario: {
      control: "inline-radio",
      options: ["attack-settled-and-win", "den-to-den", "killed-by-player", "takes-player-frontier", "attacks-and-loses"]
    }
  },
  args: { cameraDistance: 8, cycleMs: 14000, captureAtFraction: 0.07, scenario: "attack-settled-and-win" },
  render
};

export default meta;
type Story = StoryObj<Args>;

// Cycle timings account for FIGHT_DURATION_MS (1500ms) + RUN_DURATION_MS
// (10000ms, see client-map-3d-barbarian-overlay.ts) so the loop never
// restarts mid-fight or mid-walk.

export const AttacksSettledTileAndWins: Story = {
  args: { scenario: "attack-settled-and-win" },
  parameters: {
    docs: {
      description: {
        story:
          "The colossus WALKS to the settled (town) tile first, then plays the Attack clip in place once it arrives. A " +
          "defender-only marine squad fires lasers back (impact sparks land on the colossus) and dies one by one as the " +
          "colossus wins, then it stands there."
      }
    }
  }
};

export const ExpandsSettledTileToSettledTile: Story = {
  args: { scenario: "den-to-den" },
  parameters: {
    docs: {
      description: {
        story:
          "One settled barbarian tile expands into an adjacent tile that's ALSO settled — mechanically identical to fighting a " +
          "player's town (the overlay only checks ownershipState === \"SETTLED\", not who held it): walk there first, then fight."
      }
    }
  }
};

export const KilledByAnotherPlayer: Story = {
  args: { scenario: "killed-by-player", cycleMs: 6000, captureAtFraction: 0.3 },
  parameters: {
    docs: {
      description: {
        story:
          "The reverse direction of AttacksSettledTileAndWins: a player attacks and defeats a barbarian-DEFENDED tile. The real " +
          "combat broadcast is symmetric (runtime-lock-resolution.ts's hasDefendingForce/combatBroadcastJson has no special-" +
          "casing on which side is the barbarian), so this plays the SAME real fight as the win case — the colossus appears at " +
          "its own tile, a marine squad fires on it, and it dissolves into blue smoke — via the same " +
          "client-map-3d-barbarian-loss-overlay.ts used by AttacksAndLoses, just keyed to ORIGIN instead of TARGET. Ownership " +
          "then flips ORIGIN to the player's FRONTIER color, not a settled town — runtime-lock-resolution.ts's ownershipState " +
          "assignment always demotes a non-barbarian capture to FRONTIER (only barbarian-1 itself resolves straight to " +
          "SETTLED); an anchor structure may later auto-settle on its own separate timer, which this doesn't show."
      }
    }
  }
};

export const TakesPlayerFrontierTile: Story = {
  args: { scenario: "takes-player-frontier" },
  parameters: {
    docs: {
      description: {
        story:
          "A player's owned-but-unsettled frontier tile falls to the barbarian planner's routine one-tile expansion — treated " +
          "exactly like eating neutral wilderness (no fight, straight to the walk), including the real tint-expansion fade from " +
          "the player's frontier color to barbarian purple as it takes hold."
      }
    }
  }
};

export const AttacksAndLoses: Story = {
  args: { scenario: "attacks-and-loses", cycleMs: 6000, captureAtFraction: 0.2 },
  parameters: {
    docs: {
      description: {
        story:
          "The tile it attacks is real defended ground, so the fight is a real roll (frontier-combat.ts's rollFrontierCombat) " +
          "and the colossus can lose it — the ORIGIN tile stays barbarian (this is the marker client-map-3d-barbarian-overlay.ts " +
          "already renders there, unaffected), and the TARGET tile never changes hands at all: a lost attack has no tile-" +
          "ownership delta to diff, which is exactly why this needed its own overlay (client-map-3d-barbarian-loss-overlay.ts) " +
          "watching the real combat broadcast directly instead of tile deltas. A colossus appears already standing at the " +
          "defended tile (no walk telemetry survives a resolved battle), the defender squad fires on it the whole time and " +
          "never takes losses, and the colossus dissolves into a puff of blue smoke and disappears."
      }
    }
  }
};
