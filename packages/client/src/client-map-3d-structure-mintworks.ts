// 3D Mintworks overlay — the empire's fundamental gold-minting workshop.
// A compact dark-iron industrial hall whose centerpiece is a giant mechanical
// coin press: two dark-iron gantry posts, a brass crossbeam, and a brass
// stamping head driving a vertical piston + bright-brass die down onto an
// iron platform. A large brass flywheel with spokes + hub sits beside the
// press, small brass gears and a drive shaft couple it to the machinery, and
// a compact furnace with a warm orange glow opening, brass feed pipes and a
// short exhaust stack sits at the rear. Metal ingots, coin trays with stacked
// coins, wooden coin crates (one open showing minted coin rolls) and a loading
// ramp surround the hall. Reads at gameplay distance as: industrial workshop
// + giant coin press + brass machinery + coin trays/crates = gold production.
//
// Built on the shared StructurePieceBuilder so mint pieces pool with the rest
// of the economic-family instanced meshes; registered from
// client-map-3d-structure-economic.ts.

import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  MeshStandardMaterial
} from "three";
import type { StructurePieceBuilder } from "./client-map-3d-structure-builder.js";
import type { EconomicStructureLayout } from "./client-map-3d-structure-economic.js";

export const registerMintworksStructures = (builder: StructurePieceBuilder): EconomicStructureLayout => {
  const C = builder.maxTiles;
  const PI_2 = Math.PI / 2;

  // ─── Materials (Border Empires industrial palette) ────────────────────
  // Dark charcoal iron — dominant structural material.
  const ironMaterial = new MeshStandardMaterial({ color: "#2a2826", roughness: 0.7, metalness: 0.5, flatShading: true });
  // Muted grey metal — platforms, trays, structural panels.
  const greyMaterial = new MeshStandardMaterial({ color: "#4a4642", roughness: 0.85, metalness: 0.2, flatShading: true });
  // Weathered industrial brass — machinery, trim, flywheel, gears.
  const brassMaterial = new MeshStandardMaterial({ color: "#7d6a41", roughness: 0.42, metalness: 0.85, flatShading: true });
  // Brighter aged brass — coins and finished currency.
  const brightBrassMaterial = new MeshStandardMaterial({ color: "#c79156", roughness: 0.35, metalness: 0.9, flatShading: true });
  // Dark brown wood — crates and structural accents.
  const woodMaterial = new MeshStandardMaterial({ color: "#5e4530", roughness: 0.92, metalness: 0, flatShading: true });
  // Warm amber/orange furnace glow.
  const glowMaterial = new MeshStandardMaterial({ color: "#ff7a2a", roughness: 0.4, metalness: 0, flatShading: true, emissive: "#ff5318", emissiveIntensity: 0.85 });
  // Subtle blue-grey glass for the amber-glow windows. Opaque on purpose:
  // the glow layer behind it (mwWindowGlow) reads the amber through a dark
  // pane, and opaque panels avoid the sorted transparent render pass.
  const glassMaterial = new MeshStandardMaterial({ color: "#3a4048", roughness: 0.35, metalness: 0.4, flatShading: true });

  // ─── Geometries ────────────────────────────────────────────────────────
  // Workshop shell (base sits on the tile; walls + roof above it).
  const baseGeo = new BoxGeometry(0.50, 0.10, 0.40);
  const floorGeo = new BoxGeometry(0.48, 0.04, 0.38);
  const wallFrontGeo = new BoxGeometry(0.48, 0.22, 0.04);
  const wallSideGeo = new BoxGeometry(0.04, 0.22, 0.38);
  const wallBackGeo = new BoxGeometry(0.48, 0.22, 0.04);
  const roofGeo = new BoxGeometry(0.52, 0.06, 0.44);
  const roofTrimGeo = new BoxGeometry(0.54, 0.02, 0.46);
  const chimneyGeo = new BoxGeometry(0.06, 0.25, 0.06);
  const chimneyCapGeo = new ConeGeometry(0.07, 0.04, 8);
  const doorGeo = new BoxGeometry(0.10, 0.14, 0.02);
  const windowGeo = new BoxGeometry(0.09, 0.05, 0.02);
  // Central coin press (oversized relative to the rest of the machinery).
  const pressFrameGeo = new BoxGeometry(0.08, 0.35, 0.08);
  const pressHeadGeo = new CylinderGeometry(0.065, 0.065, 0.08, 10);
  const pressPistonGeo = new CylinderGeometry(0.045, 0.045, 0.20, 8);
  const pressDieGeo = new CylinderGeometry(0.055, 0.055, 0.04, 10);
  const pressPlatformGeo = new BoxGeometry(0.12, 0.03, 0.12);
  const pressTrayGeo = new BoxGeometry(0.14, 0.02, 0.08);
  // Flywheel + spokes + hub.
  const flywheelGeo = new CylinderGeometry(0.18, 0.18, 0.05, 16);
  const spokeGeo = new BoxGeometry(0.14, 0.015, 0.02);
  const hubGeo = new CylinderGeometry(0.025, 0.025, 0.06, 8);
  // Gears.
  const gearLargeGeo = new CylinderGeometry(0.10, 0.10, 0.04, 12);
  const gearMediumGeo = new CylinderGeometry(0.06, 0.06, 0.035, 10);
  const gearSmallGeo = new CylinderGeometry(0.035, 0.035, 0.03, 8);
  const gearToothGeo = new BoxGeometry(0.02, 0.025, 0.04);
  // Drive shafts, pistons, gauges and levers.
  const driveShaftGeo = new CylinderGeometry(0.015, 0.015, 0.25, 8);
  const pistonGeo = new CylinderGeometry(0.025, 0.025, 0.12, 8);
  const gaugeGeo = new CylinderGeometry(0.02, 0.02, 0.02, 8);
  const leverGeo = new BoxGeometry(0.01, 0.06, 0.01);
  // Furnace + steam system.
  const furnaceBodyGeo = new BoxGeometry(0.18, 0.18, 0.16);
  const furnaceOpeningGeo = new BoxGeometry(0.06, 0.06, 0.02);
  const furnacePipeGeo = new CylinderGeometry(0.02, 0.02, 0.25, 8);
  const exhaustStackGeo = new CylinderGeometry(0.035, 0.035, 0.22, 8);
  // Ingots, coin trays, coins, crates, ramp and imperial seal.
  const ingotGeo = new BoxGeometry(0.04, 0.025, 0.07);
  const trayGeo = new BoxGeometry(0.10, 0.015, 0.08);
  const coinGeo = new CylinderGeometry(0.012, 0.012, 0.005, 10);
  const crateGeo = new BoxGeometry(0.08, 0.06, 0.07);
  const crateCoinStackGeo = new CylinderGeometry(0.025, 0.025, 0.04, 8);
  const rampGeo = new BoxGeometry(0.15, 0.04, 0.20);
  const sealGeo = new CylinderGeometry(0.03, 0.03, 0.015, 12);
  const sealInnerGeo = new CylinderGeometry(0.018, 0.018, 0.015, 8);

  // ─── Slots ─────────────────────────────────────────────────────────────
  // Workshop shell.
  builder.makeSlot("mwBase", baseGeo, ironMaterial, C);
  builder.makeSlot("mwFloor", floorGeo, greyMaterial, C);
  builder.makeSlot("mwWallFront", wallFrontGeo, ironMaterial, C);
  builder.makeSlot("mwWallSide", wallSideGeo, ironMaterial, C * 2);
  builder.makeSlot("mwWallBack", wallBackGeo, ironMaterial, C);
  builder.makeSlot("mwRoof", roofGeo, ironMaterial, C);
  builder.makeSlot("mwRoofTrim", roofTrimGeo, brassMaterial, C);
  builder.makeSlot("mwChimney", chimneyGeo, greyMaterial, C);
  builder.makeSlot("mwChimneyCap", chimneyCapGeo, greyMaterial, C);
  builder.makeSlot("mwDoor", doorGeo, woodMaterial, C);
  builder.makeSlot("mwWindow", windowGeo, glassMaterial, C * 2);
  builder.makeSlot("mwWindowGlow", windowGeo, glowMaterial, C * 2);
  // Coin press.
  builder.makeSlot("mwPressFrame", pressFrameGeo, ironMaterial, C * 3);
  builder.makeSlot("mwPressHead", pressHeadGeo, brassMaterial, C);
  builder.makeSlot("mwPressPiston", pressPistonGeo, brassMaterial, C);
  builder.makeSlot("mwPressDie", pressDieGeo, brightBrassMaterial, C);
  builder.makeSlot("mwPressPlatform", pressPlatformGeo, greyMaterial, C);
  builder.makeSlot("mwPressTray", pressTrayGeo, greyMaterial, C);
  // Flywheel.
  builder.makeSlot("mwFlywheel", flywheelGeo, brassMaterial, C);
  builder.makeSlot("mwSpoke", spokeGeo, brassMaterial, C * 4);
  builder.makeSlot("mwHub", hubGeo, ironMaterial, C);
  // Gears.
  builder.makeSlot("mwGearLarge", gearLargeGeo, brassMaterial, C * 2);
  builder.makeSlot("mwGearMedium", gearMediumGeo, brassMaterial, C * 2);
  builder.makeSlot("mwGearSmall", gearSmallGeo, brassMaterial, C);
  builder.makeSlot("mwGearTooth", gearToothGeo, brassMaterial, C * 8);
  // Machinery details.
  builder.makeSlot("mwDriveShaft", driveShaftGeo, ironMaterial, C * 2);
  builder.makeSlot("mwPiston", pistonGeo, ironMaterial, C * 2);
  builder.makeSlot("mwGauge", gaugeGeo, brassMaterial, C * 2);
  builder.makeSlot("mwLever", leverGeo, ironMaterial, C * 2);
  // Furnace.
  builder.makeSlot("mwFurnaceBody", furnaceBodyGeo, ironMaterial, C);
  builder.makeSlot("mwFurnaceOpening", furnaceOpeningGeo, glowMaterial, C);
  builder.makeSlot("mwFurnacePipe", furnacePipeGeo, brassMaterial, C * 2);
  builder.makeSlot("mwExhaust", exhaustStackGeo, greyMaterial, C);
  // Ingots, trays, coins, crates, ramp, seal.
  builder.makeSlot("mwIngot", ingotGeo, brightBrassMaterial, C * 6);
  builder.makeSlot("mwTray", trayGeo, greyMaterial, C * 3);
  builder.makeSlot("mwCoin", coinGeo, brightBrassMaterial, C * 24);
  builder.makeSlot("mwCrate", crateGeo, woodMaterial, C * 4);
  builder.makeSlot("mwCrateCoinStack", crateCoinStackGeo, brightBrassMaterial, C * 3);
  builder.makeSlot("mwRamp", rampGeo, greyMaterial, C);
  builder.makeSlot("mwSeal", sealGeo, brassMaterial, C);
  builder.makeSlot("mwSealInner", sealInnerGeo, brightBrassMaterial, C);

  // ─── Placement ─────────────────────────────────────────────────────────
  const addMintworks: EconomicStructureLayout = (sx, sy, sz) => {
    // Foundation + floor + walls + roof. Walls are plain industrial iron;
    // the wealth reads through the brass machinery inside, not the shell.
    builder.addPiece("mwBase", sx, sy, sz, 0, 0.05, 0);
    builder.addPiece("mwFloor", sx, sy, sz, 0, 0.12, 0);
    builder.addPiece("mwWallSide", sx, sy, sz, -0.24, 0.23, 0);
    builder.addPiece("mwWallSide", sx, sy, sz, 0.24, 0.23, 0);
    builder.addPiece("mwWallBack", sx, sy, sz, 0, 0.23, -0.18);
    builder.addPiece("mwWallFront", sx, sy, sz, 0, 0.23, 0.18);
    builder.addPiece("mwRoof", sx, sy, sz, 0, 0.37, 0);
    builder.addPiece("mwRoofTrim", sx, sy, sz, 0, 0.405, 0);
    builder.addPiece("mwChimney", sx, sy, sz, 0.12, 0.52, -0.12);
    builder.addPiece("mwChimneyCap", sx, sy, sz, 0.12, 0.66, -0.12);
    builder.addPiece("mwDoor", sx, sy, sz, 0, 0.20, 0.205);
    builder.addPiece("mwWindow", sx, sy, sz, -0.16, 0.20, 0.205);
    builder.addPiece("mwWindowGlow", sx, sy, sz, -0.16, 0.20, 0.198);
    builder.addPiece("mwWindow", sx, sy, sz, 0.16, 0.20, 0.205);
    builder.addPiece("mwWindowGlow", sx, sy, sz, 0.16, 0.20, 0.198);

    // Giant central coin press rising above the front wall: two dark-iron
    // gantry posts, a brass crossbeam, brass stamping head driving the
    // vertical piston + bright-brass die onto a platform, tray at its foot.
    builder.addPiece("mwPressFrame", sx, sy, sz, -0.07, 0.275, 0.23);
    builder.addPiece("mwPressFrame", sx, sy, sz, 0.07, 0.275, 0.23);
    builder.addPiece("mwPressFrame", sx, sy, sz, 0, 0.475, 0.23, 1, 1, 1, 0, 0, PI_2);
    builder.addPiece("mwPressHead", sx, sy, sz, 0, 0.42, 0.23);
    builder.addPiece("mwPressPiston", sx, sy, sz, 0, 0.34, 0.23);
    builder.addPiece("mwPressDie", sx, sy, sz, 0, 0.22, 0.23);
    builder.addPiece("mwPressPlatform", sx, sy, sz, 0, 0.185, 0.23);
    builder.addPiece("mwPressTray", sx, sy, sz, 0, 0.135, 0.28);
    // Freshly minted coins emerging on the press tray.
    builder.addPiece("mwCoin", sx, sy, sz, -0.04, 0.148, 0.28);
    builder.addPiece("mwCoin", sx, sy, sz, 0.04, 0.148, 0.28);
    builder.addPiece("mwCoin", sx, sy, sz, 0, 0.148, 0.28);
    builder.addPiece("mwCoin", sx, sy, sz, 0, 0.148, 0.30);
    builder.addPiece("mwCoin", sx, sy, sz, -0.02, 0.16, 0.29);
    // Brass imperial seal embossed on the press crossbeam.
    builder.addPiece("mwSeal", sx, sy, sz, 0, 0.475, 0.272, 1, 1, 1, 0, PI_2, 0);
    builder.addPiece("mwSealInner", sx, sy, sz, 0, 0.475, 0.275, 1, 1, 1, 0, PI_2, 0);

    // Large brass flywheel beside the press with spokes + hub.
    builder.addPiece("mwFlywheel", sx, sy, sz, -0.26, 0.26, 0.18, 0.85, 0.85, 0.85, 0, 0, PI_2);
    builder.addPiece("mwSpoke", sx, sy, sz, -0.26, 0.26, 0.18, 0.85, 1, 0.85, 0, PI_2, 0);
    builder.addPiece("mwSpoke", sx, sy, sz, -0.26, 0.26, 0.18, 0.85, 1, 0.85, 0, PI_2, PI_2);
    builder.addPiece("mwHub", sx, sy, sz, -0.26, 0.26, 0.18, 1, 1, 1, 0, 0, PI_2);

    // Brass gear train on the right side of the press + drive shaft.
    builder.addPiece("mwGearLarge", sx, sy, sz, 0.30, 0.24, 0.20, 1, 1, 1, 0, 0, PI_2);
    builder.addPiece("mwGearTooth", sx, sy, sz, 0.30, 0.35, 0.20);
    builder.addPiece("mwGearTooth", sx, sy, sz, 0.30, 0.13, 0.20);
    builder.addPiece("mwGearTooth", sx, sy, sz, 0.19, 0.24, 0.20);
    builder.addPiece("mwGearTooth", sx, sy, sz, 0.41, 0.24, 0.20);
    builder.addPiece("mwGearMedium", sx, sy, sz, 0.24, 0.40, 0.18, 1, 1, 1, 0, 0, PI_2);
    builder.addPiece("mwGearSmall", sx, sy, sz, 0.30, 0.47, 0.18, 1, 1, 1, 0, 0, PI_2);
    builder.addPiece("mwDriveShaft", sx, sy, sz, 0.08, 0.30, 0.26, 1, 1, 1, 0, 0, PI_2);
    builder.addPiece("mwPiston", sx, sy, sz, 0.22, 0.20, 0.14);
    builder.addPiece("mwPiston", sx, sy, sz, 0.30, 0.20, 0.14);
    builder.addPiece("mwGauge", sx, sy, sz, 0.08, 0.36, 0.29, 1, 1, 1, 0, PI_2, 0);
    builder.addPiece("mwLever", sx, sy, sz, 0.10, 0.30, 0.30);
    builder.addPiece("mwLever", sx, sy, sz, 0.13, 0.30, 0.30);

    // Compact furnace at the rear-left with warm glow opening, exhaust stack
    // and brass feed pipes.
    builder.addPiece("mwFurnaceBody", sx, sy, sz, -0.20, 0.19, -0.14);
    builder.addPiece("mwFurnaceOpening", sx, sy, sz, -0.20, 0.17, -0.055);
    builder.addPiece("mwExhaust", sx, sy, sz, -0.20, 0.35, -0.14);
    builder.addPiece("mwFurnacePipe", sx, sy, sz, -0.16, 0.26, -0.19, 1, 1, 1, 0, 0, PI_2);
    builder.addPiece("mwFurnacePipe", sx, sy, sz, -0.08, 0.30, -0.12, 1, 1, 1, 0, 0, PI_2);

    // Raw metal prep at the front-left: loading ramp + bright ingot stocks.
    builder.addPiece("mwRamp", sx, sy, sz, -0.10, 0.03, 0.28);
    builder.addPiece("mwIngot", sx, sy, sz, -0.22, 0.045, 0.30);
    builder.addPiece("mwIngot", sx, sy, sz, -0.16, 0.045, 0.30);
    builder.addPiece("mwIngot", sx, sy, sz, -0.19, 0.085, 0.30);
    builder.addPiece("mwIngot", sx, sy, sz, -0.22, 0.045, 0.26);
    builder.addPiece("mwIngot", sx, sy, sz, -0.16, 0.045, 0.26);

    // Coin trays with stacked coins at the front.
    builder.addPiece("mwTray", sx, sy, sz, 0.14, 0.115, 0.28);
    builder.addPiece("mwCoin", sx, sy, sz, 0.12, 0.128, 0.28);
    builder.addPiece("mwCoin", sx, sy, sz, 0.16, 0.128, 0.29);
    builder.addPiece("mwCoin", sx, sy, sz, 0.13, 0.16, 0.285);
    builder.addPiece("mwCoin", sx, sy, sz, 0.15, 0.18, 0.285);
    builder.addPiece("mwTray", sx, sy, sz, 0.14, 0.115, 0.04);
    builder.addPiece("mwCoin", sx, sy, sz, 0.14, 0.128, 0.04);
    builder.addPiece("mwCoin", sx, sy, sz, 0.14, 0.143, 0.04);

    // Finished-currency crates on the front-right; one open crate shows
    // stacks of freshly minted coin rolls.
    builder.addPiece("mwCrate", sx, sy, sz, 0.20, 0.13, 0.08);
    builder.addPiece("mwCrate", sx, sy, sz, 0.27, 0.13, 0.06);
    builder.addPiece("mwCrate", sx, sy, sz, 0.24, 0.13, -0.02);
    builder.addPiece("mwCrate", sx, sy, sz, 0.10, 0.13, 0.02);
    builder.addPiece("mwCrateCoinStack", sx, sy, sz, 0.10, 0.185, 0.02);
    builder.addPiece("mwCrateCoinStack", sx, sy, sz, 0.10, 0.225, 0.02);
  };

  return addMintworks;
};