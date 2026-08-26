import type { Meta, StoryObj } from "@storybook/html-vite";
import { Mesh, MeshStandardMaterial, PlaneGeometry } from "three";
import {
  createBattleOverlayFx,
  LINEUP_MS,
  MARCH_MS,
  APPROACH_MS,
  CLASH_MS,
  ROUT_MS,
  type BattleOverlayRenderEntry,
  type BattleOverlaySkirmishEntry
} from "@client/client-map-3d-battle-overlay-fx.js";
import {
  registerActiveBattleFromTileDelta,
  type ActiveBattleOverlay
} from "@client/client-battle-overlay/client-battle-overlay.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

// Demonstrates the battle overlay FX exactly as the real game drives it: the
// winner is decided up front (attackerWon), and the animation — approach ->
// clash (with glyph/shard bursts) -> rout, where the loser scatters/collapses
// and retreats while the winner pushes through — merely stages that already-
// known result. See client-battle-overlay.ts for how state.activeBattles gets
// populated from the server's combat-broadcast payload in the real client.

const TILE_GAP = 2.4;

type Args = {
  attackerColor: string;
  defenderColor: string;
  attackerWon: boolean;
  cameraDistance: number;
  autoReplay: boolean;
};

const buildEntry = (args: Args, startAt: number): BattleOverlayRenderEntry => {
  const clashAt = startAt + APPROACH_MS;
  return {
    srcWorldX: -TILE_GAP / 2,
    srcWorldZ: 0,
    tgtWorldX: TILE_GAP / 2,
    tgtWorldZ: 0,
    srcSurfaceY: 0,
    tgtSurfaceY: 0,
    attackerColor: args.attackerColor,
    defenderColor: args.defenderColor,
    attackerWon: args.attackerWon,
    startAt,
    clashAt,
    endAt: clashAt + CLASH_MS + ROUT_MS,
    hashSeed: 1,
    fromSkirmish: false
  };
};

const makeTerritoryTile = (x: number, color: string): Mesh => {
  const tile = new Mesh(
    new PlaneGeometry(1.6, 1.6),
    new MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, transparent: true, opacity: 0.35 })
  );
  tile.rotation.x = -Math.PI / 2;
  tile.position.set(x, -0.01, 0);
  return tile;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#0d0f16" });
  const fx = createBattleOverlayFx(stage.scene);

  const attackerTile = makeTerritoryTile(-TILE_GAP / 2, args.attackerColor);
  const defenderTile = makeTerritoryTile(TILE_GAP / 2, args.defenderColor);
  stage.scene.add(attackerTile, defenderTile);

  let entry = buildEntry(args, performance.now());

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Replay";
  button.style.position = "absolute";
  button.style.top = "12px";
  button.style.left = "12px";
  button.style.padding = "8px 12px";
  button.style.border = "1px solid rgba(255,207,107,0.55)";
  button.style.background = "rgba(13,15,22,0.9)";
  button.style.color = "#fff3d6";
  button.style.cursor = "pointer";
  button.style.borderRadius = "4px";

  const label = document.createElement("div");
  label.style.position = "absolute";
  label.style.bottom = "12px";
  label.style.left = "12px";
  label.style.color = "#cbd5e1";
  label.style.font = "12px monospace";
  label.style.background = "rgba(13,15,22,0.75)";
  label.style.padding = "6px 10px";
  label.style.borderRadius = "4px";
  const updateLabel = (): void => {
    label.textContent = `attacker ${args.attackerWon ? "WINS" : "loses & routs"} — approach ${APPROACH_MS}ms / clash ${CLASH_MS}ms / rout ${ROUT_MS}ms`;
  };
  updateLabel();

  const replay = (): void => { entry = buildEntry(args, performance.now()); };
  button.addEventListener("click", replay);

  let intervalId = 0;
  if (args.autoReplay) intervalId = window.setInterval(replay, APPROACH_MS + CLASH_MS + ROUT_MS + 600);

  let rafId = 0;
  const animate = (): void => {
    fx.tick(performance.now(), [entry]);
    rafId = requestAnimationFrame(animate);
  };
  animate();

  const stageEl = wrapWithCleanup(stage, [
    () => {
      cancelAnimationFrame(rafId);
      if (intervalId) window.clearInterval(intervalId);
      button.removeEventListener("click", replay);
      fx.dispose();
      attackerTile.geometry.dispose();
      (attackerTile.material as MeshStandardMaterial).dispose();
      defenderTile.geometry.dispose();
      (defenderTile.material as MeshStandardMaterial).dispose();
    }
  ]);
  stageEl.appendChild(button);
  stageEl.appendChild(label);
  return stageEl;
};

const meta: Meta<Args> = {
  title: "3D Library/BattleOverlayFx",
  argTypes: {
    attackerColor: { control: "color" },
    defenderColor: { control: "color" },
    attackerWon: { control: "boolean" },
    cameraDistance: { control: { type: "range", min: 2, max: 12, step: 0.5 } },
    autoReplay: { control: "boolean" }
  },
  args: {
    attackerColor: "#4fb3ff",
    defenderColor: "#ff5d5d",
    attackerWon: true,
    cameraDistance: 5,
    autoReplay: true
  },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const AttackerWins: Story = {};
export const DefenderWins: Story = { args: { attackerWon: false } };

// Several independent battles at once, at different points in their
// lifecycle and with mixed outcomes — demonstrates that the overlay is a
// per-tile-keyed collection (state.activeBattles), not a single global slot,
// so concurrent fights anywhere the player has vision render independently.
export const ConcurrentBattles: Story = {
  render: (args) => {
    const stage = createStage({ cameraDistance: 11, background: "#0d0f16" });
    const fx = createBattleOverlayFx(stage.scene);

    const positions = [
      { dx: -3.2, dz: -3.2, won: true },
      { dx: 3.2, dz: -3.2, won: false },
      { dx: -3.2, dz: 3.2, won: true },
      { dx: 3.2, dz: 3.2, won: false }
    ];
    const now = performance.now();
    const entries: BattleOverlayRenderEntry[] = positions.map((p, i) => {
      const startAt = now - i * 400; // staggered so each is at a different phase
      const clashAt = startAt + APPROACH_MS;
      return {
        srcWorldX: p.dx - TILE_GAP / 2,
        srcWorldZ: p.dz,
        tgtWorldX: p.dx + TILE_GAP / 2,
        tgtWorldZ: p.dz,
        srcSurfaceY: 0,
        tgtSurfaceY: 0,
        attackerColor: args.attackerColor,
        defenderColor: args.defenderColor,
        attackerWon: p.won,
        startAt,
        clashAt,
        endAt: clashAt + CLASH_MS + ROUT_MS,
        hashSeed: i + 1,
        fromSkirmish: false
      };
    });

    let rafId = 0;
    const animate = (): void => {
      const t = performance.now();
      // Loop each battle independently once it finishes, staying staggered.
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i]!;
        if (t >= e.endAt) {
          const startAt = t;
          const clashAt = startAt + APPROACH_MS;
          entries[i] = { ...e, startAt, clashAt, endAt: clashAt + CLASH_MS + ROUT_MS };
        }
      }
      fx.tick(t, entries);
      rafId = requestAnimationFrame(animate);
    };
    animate();

    return wrapWithCleanup(stage, [() => cancelAnimationFrame(rafId), fx.dispose]);
  }
};

// Full lifecycle of a single siege from the moment it's first seen through to
// the resolved battle clearing: pre-resolution skirmish (approach once, then
// an indefinite oscillating clash loop for the rest of the countdown) handing
// off into the resolved battle (continuing that same approach trajectory,
// then clash + glyph bursts, then rout). Timing (startAt/clashAt/endAt) is
// computed by the real registerActiveBattleFromTileDelta — the exact function
// client-tile-delta-batch-handler.ts calls on every TILE_DELTA_BATCH — fed a
// fabricated combatJson delta, so the handoff shown here can't drift from
// what actually ships. A siege this long is impractical to just sit and
// watch, so this scrubs/plays on a virtual clock instead of wall time: drag
// the timeline, jump to a phase boundary, or press play at any speed.
type LifecycleArgs = {
  attackerColor: string;
  defenderColor: string;
  attackerWon: boolean;
  cameraDistance: number;
  siegeDurationMs: number;
  playbackSpeed: number;
  autoPlay: boolean;
};

const SIEGE_KEY = "5,5";
const keyForSim = (_x: number, _y: number): string => SIEGE_KEY;

const computeHandoff = (args: LifecycleArgs): { startAt: number; clashAt: number; endAt: number } => {
  const state = { activeBattles: new Map<string, ActiveBattleOverlay>(), skirmishSeenAt: new Map([[SIEGE_KEY, 0]]) };
  const combatJson = JSON.stringify({
    attackerOwnerId: "attacker",
    defenderOwnerId: "defender",
    attackerWon: args.attackerWon,
    originX: 0,
    originY: 0
  });
  // nowMs = siegeDurationMs: the resolution broadcast lands exactly when the
  // siege's countdown ends, on this story's virtual clock (t=0 is when the
  // skirmish's own startAt/skirmishSeenAt was stamped).
  registerActiveBattleFromTileDelta(state, keyForSim, { x: 5, y: 5, combatJson }, args.siegeDurationMs);
  const battle = state.activeBattles.get(SIEGE_KEY)!;
  return { startAt: battle.startAt, clashAt: battle.clashAt, endAt: battle.endAt };
};

const SPEED_OPTIONS = [0.5, 1, 2, 4, 8, 16, 32];

const styleButton = (el: HTMLElement): void => {
  el.style.padding = "6px 10px";
  el.style.border = "1px solid rgba(255,207,107,0.55)";
  el.style.background = "rgba(13,15,22,0.9)";
  el.style.color = "#fff3d6";
  el.style.cursor = "pointer";
  el.style.borderRadius = "4px";
  el.style.font = "11px monospace";
};

export const FullAttackLifecycle: StoryObj<LifecycleArgs> = {
  argTypes: {
    attackerColor: { control: "color" },
    defenderColor: { control: "color" },
    attackerWon: { control: "boolean" },
    cameraDistance: { control: { type: "range", min: 2, max: 12, step: 0.5 } },
    siegeDurationMs: { control: { type: "range", min: 200, max: 60_000, step: 100 }, description: "Server-side siege countdown (resolvesAt - now). ~30s in the real game." },
    playbackSpeed: { control: { type: "select" }, options: SPEED_OPTIONS },
    autoPlay: { control: "boolean" }
  },
  args: {
    attackerColor: "#4fb3ff",
    defenderColor: "#ff5d5d",
    attackerWon: true,
    cameraDistance: 5,
    siegeDurationMs: 8_000,
    playbackSpeed: 1,
    autoPlay: true
  },
  render: (args) => {
    const stage = createStage({ cameraDistance: args.cameraDistance, background: "#0d0f16" });
    const fx = createBattleOverlayFx(stage.scene);

    const attackerTile = makeTerritoryTile(-TILE_GAP / 2, args.attackerColor);
    const defenderTile = makeTerritoryTile(TILE_GAP / 2, args.defenderColor);
    stage.scene.add(attackerTile, defenderTile);

    const { startAt, clashAt, endAt } = computeHandoff(args);
    const totalMs = endAt;

    const skirmish: BattleOverlaySkirmishEntry = {
      srcWorldX: -TILE_GAP / 2, srcWorldZ: 0,
      tgtWorldX: TILE_GAP / 2, tgtWorldZ: 0,
      srcSurfaceY: 0, tgtSurfaceY: 0,
      attackerColor: args.attackerColor,
      defenderColor: args.defenderColor,
      startAt,
      hashSeed: 1
    };
    const battle: BattleOverlayRenderEntry = {
      srcWorldX: -TILE_GAP / 2, srcWorldZ: 0,
      tgtWorldX: TILE_GAP / 2, tgtWorldZ: 0,
      srcSurfaceY: 0, tgtSurfaceY: 0,
      attackerColor: args.attackerColor,
      defenderColor: args.defenderColor,
      attackerWon: args.attackerWon,
      startAt, clashAt, endAt,
      hashSeed: 1,
      fromSkirmish: true
    };

    const tickAt = (t: number): void => {
      if (t < args.siegeDurationMs) fx.tick(t, [], [skirmish]);
      else if (t < endAt) fx.tick(t, [battle], []);
      else fx.tick(t, [], []);
    };

    const phaseAt = (t: number): { name: string; detail: string } => {
      if (t < args.siegeDurationMs) {
        if (t < LINEUP_MS) {
          return { name: "SKIRMISH · lineup", detail: `${t.toFixed(0)} / ${LINEUP_MS}ms — both sides forming up at their own edge` };
        }
        if (t < APPROACH_MS) {
          return { name: "SKIRMISH · march", detail: `${(t - LINEUP_MS).toFixed(0)} / ${MARCH_MS}ms — both sides advancing on the tile center` };
        }
        return {
          name: "SKIRMISH · clash loop",
          detail: `${(t / 1000).toFixed(1)}s / ${(args.siegeDurationMs / 1000).toFixed(1)}s countdown — oscillating melee, glyph bursts, first-cycle casualties already shed (WINNER_DEATHS per side)`
        };
      }
      if (t < clashAt) {
        return { name: "RESOLVED · finishing lineup/march", detail: `${(t - startAt).toFixed(0)} / ${APPROACH_MS}ms — broadcast landed before the skirmish's own lineup/march finished` };
      }
      if (t < clashAt + CLASH_MS) {
        return { name: "RESOLVED · clash + glyph bursts + casualties", detail: `${(t - clashAt).toFixed(0)} / ${CLASH_MS}ms — outcome now known, some dots start falling` };
      }
      if (t < endAt) {
        return {
          name: "RESOLVED · rout",
          detail: `${(t - clashAt - CLASH_MS).toFixed(0)} / ${ROUT_MS}ms — ${args.attackerWon ? "attacker pushes through" : "defender holds, attacker scatters"}`
        };
      }
      return { name: "DONE", detail: "state.activeBattles entry pruned — nothing left to render" };
    };

    // -- controls --------------------------------------------------------
    const controls = document.createElement("div");
    controls.style.position = "absolute";
    controls.style.left = "0";
    controls.style.right = "0";
    controls.style.bottom = "0";
    controls.style.padding = "10px 12px";
    controls.style.background = "rgba(13,15,22,0.85)";
    controls.style.display = "flex";
    controls.style.flexDirection = "column";
    controls.style.gap = "6px";
    controls.style.fontFamily = "monospace";

    const label = document.createElement("div");
    label.style.color = "#cbd5e1";
    label.style.font = "12px monospace";

    const scrubber = document.createElement("input");
    scrubber.type = "range";
    scrubber.min = "0";
    scrubber.max = String(totalMs);
    scrubber.step = "16";
    scrubber.value = "0";
    scrubber.style.width = "100%";

    const buttonsRow = document.createElement("div");
    buttonsRow.style.display = "flex";
    buttonsRow.style.gap = "6px";
    buttonsRow.style.alignItems = "center";
    buttonsRow.style.flexWrap = "wrap";

    const playButton = document.createElement("button");
    playButton.type = "button";
    styleButton(playButton);

    const speedSelect = document.createElement("select");
    styleButton(speedSelect);
    for (const s of SPEED_OPTIONS) {
      const opt = document.createElement("option");
      opt.value = String(s);
      opt.textContent = `${s}x`;
      if (s === args.playbackSpeed) opt.selected = true;
      speedSelect.appendChild(opt);
    }

    const jumpTo = (t: number) => (): void => {
      simT = Math.max(0, Math.min(totalMs, t));
      playing = false;
      scrubber.value = String(simT);
      tickAt(simT);
      updateUi();
    };
    const jumps: Array<[string, number]> = [
      ["0s", 0],
      ["Lineup end", LINEUP_MS],
      ["March end", APPROACH_MS],
      ["Resolve", args.siegeDurationMs],
      ["Clash end", clashAt + CLASH_MS],
      ["Rout end", endAt]
    ];
    const jumpButtons = jumps.map(([text, t]) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = text;
      styleButton(btn);
      btn.addEventListener("click", jumpTo(t));
      return btn;
    });

    let simT = 0;
    let playing = args.autoPlay;
    let speed = args.playbackSpeed;

    const updateUi = (): void => {
      const { name, detail } = phaseAt(simT);
      label.textContent = `${name} — ${detail}  |  t=${(simT / 1000).toFixed(2)}s / ${(totalMs / 1000).toFixed(2)}s`;
      playButton.textContent = playing ? "Pause" : "Play";
    };

    playButton.addEventListener("click", () => {
      if (simT >= totalMs) simT = 0;
      playing = !playing;
      updateUi();
    });
    speedSelect.addEventListener("change", () => { speed = Number(speedSelect.value); });
    scrubber.addEventListener("input", () => {
      simT = Number(scrubber.value);
      playing = false;
      tickAt(simT);
      updateUi();
    });

    buttonsRow.appendChild(playButton);
    buttonsRow.appendChild(speedSelect);
    for (const btn of jumpButtons) buttonsRow.appendChild(btn);
    controls.appendChild(label);
    controls.appendChild(scrubber);
    controls.appendChild(buttonsRow);

    let lastReal = performance.now();
    let rafId = 0;
    const animate = (): void => {
      const now = performance.now();
      const dt = now - lastReal;
      lastReal = now;
      if (playing) {
        simT = Math.min(totalMs, simT + dt * speed);
        scrubber.value = String(simT);
        if (simT >= totalMs) playing = false;
      }
      tickAt(simT);
      updateUi();
      rafId = requestAnimationFrame(animate);
    };
    animate();

    const stageEl = wrapWithCleanup(stage, [
      () => {
        cancelAnimationFrame(rafId);
        fx.dispose();
        attackerTile.geometry.dispose();
        (attackerTile.material as MeshStandardMaterial).dispose();
        defenderTile.geometry.dispose();
        (defenderTile.material as MeshStandardMaterial).dispose();
      }
    ]);
    stageEl.appendChild(controls);
    return stageEl;
  }
};
