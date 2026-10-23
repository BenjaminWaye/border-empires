import type { Meta, StoryObj } from "@storybook/html-vite";
import { Mesh, MeshStandardMaterial, PlaneGeometry } from "three";
import {
  createPopupMarineOverlayFx,
  APPROACH_MS,
  CLASH_MS,
  ROUT_MS,
  type BattleOverlayRenderEntry
} from "@client/client-map-3d-popup-marine/popup-marine-overlay-fx.js";
import { createBuildingEnvironmentTexture } from "@client/client-map-3d-atmosphere.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

// Review set for the weapons-factory battle units (docs/agents/topics/
// battle-units.md): full resolved battles -- lineup, advance, firefight,
// rout -- on auto-replay, with each side's factories toggled. Same overlay
// code the game runs (popup-marine-overlay-fx.ts), with the game's building
// environment map so bare metal reflects as it does on the map. The
// pre-resolution firefight loop is PopupMarineSkirmish; marches are
// MusterTransitOverlay/MixedCompany.

const TILE_GAP = 2.4;
const REPLAY_PAUSE_MS = 900;

type Args = {
  attackerWon: boolean;
  attackerTitanium: boolean;
  attackerUmbrite: boolean;
  defenderTitanium: boolean;
  defenderUmbrite: boolean;
  cameraDistance: number;
  hashSeed: number;
};

const ATTACKER_COLOR = "#4fb3ff";
const DEFENDER_COLOR = "#ff5d5d";

const buildEntry = (args: Args, startAt: number): BattleOverlayRenderEntry => {
  const clashAt = startAt + APPROACH_MS;
  return {
    srcWorldX: -TILE_GAP / 2,
    srcWorldZ: 0,
    tgtWorldX: TILE_GAP / 2,
    tgtWorldZ: 0,
    srcSurfaceY: 0,
    tgtSurfaceY: 0,
    attackerColor: ATTACKER_COLOR,
    defenderColor: DEFENDER_COLOR,
    attackerWon: args.attackerWon,
    startAt,
    clashAt,
    endAt: clashAt + CLASH_MS + ROUT_MS,
    hashSeed: args.hashSeed,
    fromSkirmish: false,
    attackerGear: { titanium: args.attackerTitanium, umbrite: args.attackerUmbrite },
    defenderGear: { titanium: args.defenderTitanium, umbrite: args.defenderUmbrite }
  };
};

const tile = (x: number, color: string): Mesh => {
  const mesh = new Mesh(
    new PlaneGeometry(1.6, 1.6),
    new MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, transparent: true, opacity: 0.35 })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, -0.01, 0);
  return mesh;
};

const phaseOf = (entry: BattleOverlayRenderEntry, now: number): string => {
  if (now < entry.clashAt) return "APPROACH";
  if (now < entry.clashAt + CLASH_MS) return "FIREFIGHT";
  if (now < entry.endAt) return "ROUT";
  return "(replaying)";
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#0d0f16" });
  const envMap = createBuildingEnvironmentTexture(stage.renderer);
  const fx = createPopupMarineOverlayFx(stage.scene, envMap);
  const attackerTile = tile(-TILE_GAP / 2, ATTACKER_COLOR);
  const defenderTile = tile(TILE_GAP / 2, DEFENDER_COLOR);
  stage.scene.add(attackerTile, defenderTile);

  let entry = buildEntry(args, performance.now());
  const label = document.createElement("div");
  label.style.cssText =
    "position:absolute;bottom:12px;left:12px;color:#cbd5e1;font:12px monospace;background:rgba(13,15,22,0.75);padding:6px 10px;border-radius:4px";
  const describeSide = (titanium: boolean, umbrite: boolean): string =>
    [titanium ? "titanium" : "", umbrite ? "umbrite" : ""].filter(Boolean).join("+") || "infantry";
  const sides = `blue ${describeSide(args.attackerTitanium, args.attackerUmbrite)} vs red ${describeSide(args.defenderTitanium, args.defenderUmbrite)}`;

  let rafId = 0;
  const animate = (): void => {
    const now = performance.now();
    if (now > entry.endAt + REPLAY_PAUSE_MS) entry = buildEntry(args, now);
    fx.tick(now, [entry]);
    label.textContent = `${sides} -- ${args.attackerWon ? "blue wins" : "red holds"} -- ${phaseOf(entry, now)}`;
    rafId = requestAnimationFrame(animate);
  };
  animate();

  const stageEl = wrapWithCleanup(stage, [
    () => {
      cancelAnimationFrame(rafId);
      fx.dispose();
      envMap.dispose();
      for (const mesh of [attackerTile, defenderTile]) {
        mesh.geometry.dispose();
        (mesh.material as MeshStandardMaterial).dispose();
      }
    }
  ]);
  stageEl.appendChild(label);
  return stageEl;
};

const meta: Meta<Args> = {
  title: "Battle Units Review/Resolved Battles",
  argTypes: {
    attackerWon: { control: "boolean" },
    attackerTitanium: { control: "boolean" },
    attackerUmbrite: { control: "boolean" },
    defenderTitanium: { control: "boolean" },
    defenderUmbrite: { control: "boolean" },
    cameraDistance: { control: { type: "range", min: 1.5, max: 8, step: 0.25 } },
    hashSeed: { control: { type: "number", min: 0, step: 1 } }
  },
  args: {
    attackerWon: true,
    attackerTitanium: false,
    attackerUmbrite: false,
    defenderTitanium: false,
    defenderUmbrite: false,
    cameraDistance: 2.4,
    hashSeed: 1
  },
  render
};

export default meta;
type Story = StoryObj<Args>;

/** Baseline: plain infantry on both sides, for comparison. */
export const InfantryBaseline: Story = {};
/** Blue's titanium walkers win: the assault walker charges, the gunner holds back, both press on through the rout. */
export const TitaniumWins: Story = { args: { attackerTitanium: true } };
/** Blue's titanium walkers lose: the assault walker peels back off its melee spot with the retreat. */
export const TitaniumLoses: Story = { args: { attackerTitanium: true, attackerWon: false } };
/** Umbrite troopers (braced kneel, shoulder cannons) defend against titanium walkers and hold. */
export const UmbriteHoldsAgainstTitanium: Story = { args: { attackerTitanium: true, defenderUmbrite: true, attackerWon: false } };
/** Both empires own both factories: 4 specialists a side (the budget's maximum). */
export const BothFactoriesEachSide: Story = {
  args: { attackerTitanium: true, attackerUmbrite: true, defenderTitanium: true, defenderUmbrite: true }
};
