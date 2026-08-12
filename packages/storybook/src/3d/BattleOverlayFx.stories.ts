import type { Meta, StoryObj } from "@storybook/html-vite";
import { Mesh, MeshStandardMaterial, PlaneGeometry } from "three";
import {
  createBattleOverlayFx,
  APPROACH_MS,
  CLASH_MS,
  ROUT_MS,
  type BattleOverlayRenderEntry
} from "@client/client-map-3d-battle-overlay-fx.js";
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
    hashSeed: 1
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
        hashSeed: i + 1
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
