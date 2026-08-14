// 3D Mintworks overlay — the empire's engine of monetary wealth. A compact
// dark-iron industrial hall, deliberately plain and bureaucratic, whose
// centerpiece is a giant mechanical coin press rising through the open front:
// two riveted gantry posts, a brass crossbeam bearing the imperial seal, and
// a brass stamping head driving a vertical piston + bright-brass die down onto
// an iron platform, with freshly stamped coins spilling onto a tray beneath.
// A large brass flywheel with spokes + rim sits beside the press, coupled into
// the machinery by a gear train (large/medium/small gears and teeth), a drive
// shaft, secondary pistons, pressure gauges and control levers. The shell is
// riveted: corner braces, a brass-collared chimney, and rivet lines along the
// base and roof trim. A compact furnace glows warm orange at the rear with
// brass feed pipes, coupling joints, an exhaust stack, and a bright ember
// core visible in the opening. Bright ingots and cast blanks wait on the
// front-left loading ramp, coin trays hold stacked minted coins, and wooden
// coin crates (one open showing coin rolls) store the finished currency.
// Reads at gameplay distance as: industrial workshop + giant coin press +
// brass machinery + coin trays/crates = gold production.
//
// Built on the shared StructurePieceBuilder so mint pieces pool with the rest
// of the economic-family instanced meshes; registered from
// client-map-3d-structure-economic.ts.

import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  OctahedronGeometry,
  Quaternion,
  TorusGeometry,
  Vector3
} from "three";
import type { StructurePieceBuilder } from "./client-map-3d-structure-builder.js";
import type { EconomicStructureLayout } from "./client-map-3d-structure-economic.js";

export type MintworksHandle = {
  readonly layout: EconomicStructureLayout;
  readonly clear: () => void;
  readonly update: (nowMs: number) => void;
};

export const registerMintworksStructures = (builder: StructurePieceBuilder): MintworksHandle => {
  const C = builder.maxTiles;
  const PI_2 = Math.PI / 2;
  // Flywheel spin rate — a few seconds per revolution, slow enough to read as
  // idle machinery (same family as the relay beacon's 10.5s mirror sweep).
  const SPIN_SPEED = 0.001;

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
  // Charcoal rivets — fastener detail on the base, roof trim and walls.
  const rivetMaterial = new MeshStandardMaterial({ color: "#1f1d1b", roughness: 0.6, metalness: 0.35, flatShading: true });

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
  // Fastener + mechanical ring details (rivets, collar bands, flywheel rim).
  const rivetGeo = new BoxGeometry(0.014, 0.01, 0.014);
  const collarGeo = new TorusGeometry(0.045, 0.01, 6, 12);
  const rimGeo = new TorusGeometry(0.185, 0.02, 6, 20);
  const braceGeo = new CylinderGeometry(0.012, 0.012, 0.32, 6);
  const blankGeo = new OctahedronGeometry(0.018, 0);
  const emberGeo = new OctahedronGeometry(0.02, 0);

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
  // Fastener + mechanical ring details.
  builder.makeSlot("mwRivet", rivetGeo, rivetMaterial, C * 12);
  builder.makeSlot("mwCollar", collarGeo, brassMaterial, C * 4);
  builder.makeSlot("mwRim", rimGeo, brassMaterial, C);
  builder.makeSlot("mwBrace", braceGeo, ironMaterial, C * 4);
  builder.makeSlot("mwBlank", blankGeo, brightBrassMaterial, C * 4);
  builder.makeSlot("mwEmber", emberGeo, glowMaterial, C * 2);

  // Resolved once (not per frame): the animated slots' InstancedMesh refs, so
  // the per-frame flywheel spin can write matrices and flag GPU upload ranges
  // directly instead of paying a Map lookup per piece, per mint, every frame.
  const flywheelMesh = builder.getMesh("mwFlywheel")!;
  const spokeMesh = builder.getMesh("mwSpoke")!;
  const hubMesh = builder.getMesh("mwHub")!;
  const rimMesh = builder.getMesh("mwRim")!;
  const flywheelAssemblyMeshes = [flywheelMesh, spokeMesh, hubMesh, rimMesh];

  // ─── Placement ─────────────────────────────────────────────────────────
  // Overall footprint is 33% smaller than the piece geometries above imply:
  // offsets and per-piece scales are both shrunk by SCALE so the whole
  // structure shrinks uniformly around the tile origin.
  const SCALE = 2 / 3;
  const add = (
    key: string,
    sx2: number,
    sy2: number,
    sz2: number,
    ox: number,
    oy: number,
    oz: number,
    sx3 = 1,
    sy3 = 1,
    sz3 = 1,
    rotY = 0,
    rotX = 0,
    rotZ = 0
  ): number => {
    return builder.addPiece(key, sx2, sy2, sz2, ox * SCALE, oy * SCALE, oz * SCALE, sx3 * SCALE, sy3 * SCALE, sz3 * SCALE, rotY, rotX, rotZ);
  };

  // ─── Flywheel animation ──────────────────────────────────────────────
  // The brass flywheel assembly (flywheel + two spokes + hub + rim) spins
  // slowly about its axle (world X). Each of the five pieces is the rest
  // pose it was placed in, with an extra rotation about X applied *after*
  // placement; with Euler order "XYZ" the matrix is Rx(a)*Ry(restY)*Rz(restZ),
  // so the X term lands outermost — the disc turns about its own axle, which
  // stays fixed along world X, and the assembly stays coplanar in the YZ
  // plane. At a=0 the matrix collapses to exactly the static rest pose.
  type FlywheelPiece = {
    readonly key: string;
    readonly mesh: InstancedMesh;
    readonly index: number;
    readonly ox: number;
    readonly oy: number;
    readonly oz: number;
    readonly sx: number;
    readonly sy: number;
    readonly sz: number;
    readonly restRotY: number;
    readonly restRotZ: number;
  };
  type MintRecord = {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly phase: number;
    readonly pieces: ReadonlyArray<FlywheelPiece>;
  };
  const mintRecords: MintRecord[] = [];

  // Deterministic per-tile phase from the scene position (layout callbacks
  // carry no world tile coords). Integer tile centers give distinct hashes
  // to neighbouring mints, desyncing their spin like the relay beacons.
  const phaseFor = (x: number, y: number, z: number): number => {
    const hash = ((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) >>> 0;
    return ((hash % 1000) / 1000) * Math.PI * 2;
  };

  const addMintworks: EconomicStructureLayout = (sx, sy, sz) => {
    // The animated flywheel slots are capped at C (one slot per mint); drop
    // mints beyond that up front so the records and the piece buffers stay in
    // lockstep (same trick as the relay beacon dropping excess beacons).
    if (mintRecords.length >= C) return;
    // Foundation + floor + walls + roof. Walls are plain industrial iron;
    // the wealth reads through the brass machinery inside, not the shell.
    add("mwBase", sx, sy, sz, 0, 0.05, 0);
    add("mwFloor", sx, sy, sz, 0, 0.12, 0);
    add("mwWallSide", sx, sy, sz, -0.24, 0.23, 0);
    add("mwWallSide", sx, sy, sz, 0.24, 0.23, 0);
    add("mwWallBack", sx, sy, sz, 0, 0.23, -0.18);
    add("mwWallFront", sx, sy, sz, 0, 0.23, 0.18);
    // Reinforced corner braces leaning against the front walls.
    add("mwBrace", sx, sy, sz, -0.20, 0.24, 0.10, 1, 1, 1, 0, 0, -0.9);
    add("mwBrace", sx, sy, sz, 0.20, 0.24, 0.10, 1, 1, 1, 0, 0, 0.9);
    add("mwRoof", sx, sy, sz, 0, 0.37, 0);
    add("mwRoofTrim", sx, sy, sz, 0, 0.405, 0);
    add("mwChimney", sx, sy, sz, 0.12, 0.52, -0.12);
    add("mwChimneyCap", sx, sy, sz, 0.12, 0.66, -0.12);
    add("mwCollar", sx, sy, sz, 0.12, 0.56, -0.12, 1, 1, 1, 0, PI_2, 0);
    add("mwDoor", sx, sy, sz, 0, 0.20, 0.205);
    add("mwWindow", sx, sy, sz, -0.16, 0.20, 0.205);
    add("mwWindowGlow", sx, sy, sz, -0.16, 0.20, 0.198);
    add("mwWindow", sx, sy, sz, 0.16, 0.20, 0.205);
    add("mwWindowGlow", sx, sy, sz, 0.16, 0.20, 0.198);
    // Rivet lines along the base step and roof trim corners.
    add("mwRivet", sx, sy, sz, -0.20, 0.105, 0.19);
    add("mwRivet", sx, sy, sz, 0.20, 0.105, 0.19);
    add("mwRivet", sx, sy, sz, -0.20, 0.105, -0.19);
    add("mwRivet", sx, sy, sz, 0.20, 0.105, -0.19);
    add("mwRivet", sx, sy, sz, -0.24, 0.41, 0.22);
    add("mwRivet", sx, sy, sz, 0.24, 0.41, 0.22);
    add("mwRivet", sx, sy, sz, -0.24, 0.41, -0.22);
    add("mwRivet", sx, sy, sz, 0.24, 0.41, -0.22);

    // Giant central coin press rising above the front wall: two dark-iron
    // gantry posts, a brass crossbeam, brass stamping head driving the
    // vertical piston + bright-brass die onto a platform, tray at its foot.
    add("mwPressFrame", sx, sy, sz, -0.07, 0.275, 0.23);
    add("mwPressFrame", sx, sy, sz, 0.07, 0.275, 0.23);
    add("mwPressFrame", sx, sy, sz, 0, 0.475, 0.23, 1, 1, 1, 0, 0, PI_2);
    add("mwPressHead", sx, sy, sz, 0, 0.42, 0.23);
    add("mwPressPiston", sx, sy, sz, 0, 0.34, 0.23);
    add("mwPressDie", sx, sy, sz, 0, 0.22, 0.23);
    add("mwPressPlatform", sx, sy, sz, 0, 0.185, 0.23);
    add("mwPressTray", sx, sy, sz, 0, 0.135, 0.28);
    // Raw coin blanks resting at the press foot, awaiting stamping.
    add("mwBlank", sx, sy, sz, -0.05, 0.16, 0.27);
    add("mwBlank", sx, sy, sz, 0.05, 0.17, 0.26);
    add("mwBlank", sx, sy, sz, 0.02, 0.155, 0.24);
    // Freshly minted coins emerging on the press tray.
    add("mwCoin", sx, sy, sz, -0.04, 0.148, 0.28);
    add("mwCoin", sx, sy, sz, 0.04, 0.148, 0.28);
    add("mwCoin", sx, sy, sz, 0, 0.148, 0.28);
    add("mwCoin", sx, sy, sz, 0, 0.148, 0.30);
    add("mwCoin", sx, sy, sz, -0.02, 0.16, 0.29);
    // Brass imperial seal embossed on the press crossbeam.
    add("mwSeal", sx, sy, sz, 0, 0.475, 0.272, 1, 1, 1, 0, PI_2, 0);
    add("mwSealInner", sx, sy, sz, 0, 0.475, 0.275, 1, 1, 1, 0, PI_2, 0);

    // Large brass flywheel beside the press with spokes + hub, ringed by a
    // heavier brass rim so it reads as a flywheel rather than a coin. The
    // disc (rotZ) lies in the YZ plane, so spokes and rim share that plane.
    // Indices are captured so update() can spin the whole assembly.
    const flywheelIndex = add("mwFlywheel", sx, sy, sz, -0.26, 0.26, 0.18, 0.85, 0.85, 0.85, 0, 0, PI_2);
    const spokeAIndex = add("mwSpoke", sx, sy, sz, -0.26, 0.26, 0.18, 0.85, 1, 0.85, 0, 0, PI_2);
    const spokeBIndex = add("mwSpoke", sx, sy, sz, -0.26, 0.26, 0.18, 0.85, 1, 0.85, PI_2, 0, 0);
    const hubIndex = add("mwHub", sx, sy, sz, -0.26, 0.26, 0.18, 1, 1, 1, 0, 0, PI_2);
    const rimIndex = add("mwRim", sx, sy, sz, -0.26, 0.26, 0.18, 0.85, 0.85, 0.85, PI_2, 0, 0);
    mintRecords.push({
      x: sx,
      y: sy,
      z: sz,
      phase: phaseFor(sx, sy, sz),
      pieces: [
        { key: "mwFlywheel", mesh: flywheelMesh, index: flywheelIndex, ox: -0.26 * SCALE, oy: 0.26 * SCALE, oz: 0.18 * SCALE, sx: 0.85 * SCALE, sy: 0.85 * SCALE, sz: 0.85 * SCALE, restRotY: 0, restRotZ: PI_2 },
        { key: "mwSpoke", mesh: spokeMesh, index: spokeAIndex, ox: -0.26 * SCALE, oy: 0.26 * SCALE, oz: 0.18 * SCALE, sx: 0.85 * SCALE, sy: SCALE, sz: 0.85 * SCALE, restRotY: 0, restRotZ: PI_2 },
        { key: "mwSpoke", mesh: spokeMesh, index: spokeBIndex, ox: -0.26 * SCALE, oy: 0.26 * SCALE, oz: 0.18 * SCALE, sx: 0.85 * SCALE, sy: SCALE, sz: 0.85 * SCALE, restRotY: PI_2, restRotZ: 0 },
        { key: "mwHub", mesh: hubMesh, index: hubIndex, ox: -0.26 * SCALE, oy: 0.26 * SCALE, oz: 0.18 * SCALE, sx: SCALE, sy: SCALE, sz: SCALE, restRotY: 0, restRotZ: PI_2 },
        { key: "mwRim", mesh: rimMesh, index: rimIndex, ox: -0.26 * SCALE, oy: 0.26 * SCALE, oz: 0.18 * SCALE, sx: 0.85 * SCALE, sy: 0.85 * SCALE, sz: 0.85 * SCALE, restRotY: PI_2, restRotZ: 0 }
      ]
    });

    // Brass gear train on the right side of the press + drive shaft.
    add("mwGearLarge", sx, sy, sz, 0.30, 0.24, 0.20, 1, 1, 1, 0, 0, PI_2);
    add("mwGearTooth", sx, sy, sz, 0.30, 0.35, 0.20);
    add("mwGearTooth", sx, sy, sz, 0.30, 0.13, 0.20);
    add("mwGearTooth", sx, sy, sz, 0.19, 0.24, 0.20);
    add("mwGearTooth", sx, sy, sz, 0.41, 0.24, 0.20);
    add("mwGearMedium", sx, sy, sz, 0.24, 0.40, 0.18, 1, 1, 1, 0, 0, PI_2);
    add("mwGearSmall", sx, sy, sz, 0.30, 0.47, 0.18, 1, 1, 1, 0, 0, PI_2);
    add("mwDriveShaft", sx, sy, sz, 0.08, 0.30, 0.26, 1, 1, 1, 0, 0, PI_2);
    add("mwPiston", sx, sy, sz, 0.22, 0.20, 0.14);
    add("mwPiston", sx, sy, sz, 0.30, 0.20, 0.14);
    add("mwGauge", sx, sy, sz, 0.08, 0.36, 0.29, 1, 1, 1, 0, PI_2, 0);
    add("mwLever", sx, sy, sz, 0.10, 0.30, 0.30);
    add("mwLever", sx, sy, sz, 0.13, 0.30, 0.30);

    // Compact furnace at the rear-left with warm glow opening, exhaust stack
    // and brass feed pipes.
    add("mwFurnaceBody", sx, sy, sz, -0.20, 0.19, -0.14);
    add("mwFurnaceOpening", sx, sy, sz, -0.20, 0.17, -0.055);
    add("mwEmber", sx, sy, sz, -0.20, 0.17, -0.045);
    add("mwExhaust", sx, sy, sz, -0.20, 0.35, -0.14);
    add("mwCollar", sx, sy, sz, -0.20, 0.40, -0.14, 1, 1, 1, 0, PI_2, 0);
    add("mwFurnacePipe", sx, sy, sz, -0.16, 0.26, -0.19, 1, 1, 1, 0, 0, PI_2);
    add("mwFurnacePipe", sx, sy, sz, -0.08, 0.30, -0.12, 1, 1, 1, 0, 0, PI_2);

    // Raw metal prep at the front-left: loading ramp + bright ingot stocks.
    add("mwRamp", sx, sy, sz, -0.10, 0.03, 0.28);
    add("mwIngot", sx, sy, sz, -0.22, 0.045, 0.30);
    add("mwIngot", sx, sy, sz, -0.16, 0.045, 0.30);
    add("mwIngot", sx, sy, sz, -0.19, 0.085, 0.30);
    add("mwIngot", sx, sy, sz, -0.22, 0.045, 0.26);
    add("mwIngot", sx, sy, sz, -0.16, 0.045, 0.26);

    // Coin trays with stacked coins at the front.
    add("mwTray", sx, sy, sz, 0.14, 0.115, 0.28);
    add("mwCoin", sx, sy, sz, 0.12, 0.128, 0.28);
    add("mwCoin", sx, sy, sz, 0.16, 0.128, 0.29);
    add("mwCoin", sx, sy, sz, 0.13, 0.16, 0.285);
    add("mwCoin", sx, sy, sz, 0.15, 0.18, 0.285);
    add("mwTray", sx, sy, sz, 0.14, 0.115, 0.04);
    add("mwCoin", sx, sy, sz, 0.14, 0.128, 0.04);
    add("mwCoin", sx, sy, sz, 0.14, 0.143, 0.04);

    // Finished-currency crates on the front-right; one open crate shows
    // stacks of freshly minted coin rolls.
    add("mwCrate", sx, sy, sz, 0.20, 0.13, 0.08);
    add("mwCrate", sx, sy, sz, 0.27, 0.13, 0.06);
    add("mwCrate", sx, sy, sz, 0.24, 0.13, -0.02);
    add("mwCrate", sx, sy, sz, 0.10, 0.13, 0.02);
    add("mwCrateCoinStack", sx, sy, sz, 0.10, 0.185, 0.02);
    add("mwCrateCoinStack", sx, sy, sz, 0.10, 0.225, 0.02);
  };

  const matrix = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();
  const tmpEuler = new Euler();
  const tmpQuat = new Quaternion();

  const update = (nowMs: number): void => {
    const count = mintRecords.length;
    if (count === 0) return;
    for (const t of mintRecords) {
      const angle = nowMs * SPIN_SPEED + t.phase;
      for (const piece of t.pieces) {
        tmpEuler.set(angle, piece.restRotY, piece.restRotZ, "XYZ");
        tmpQuat.setFromEuler(tmpEuler);
        position.set(t.x + piece.ox, t.y + piece.oy, t.z + piece.oz);
        scale.set(piece.sx, piece.sy, piece.sz);
        matrix.compose(position, tmpQuat, scale);
        piece.mesh.setMatrixAt(piece.index, matrix);
      }
    }
    for (const mesh of flywheelAssemblyMeshes) {
      if (mesh.count === 0) continue;
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16);
      mesh.instanceMatrix.needsUpdate = true;
    }
  };

  const clear = (): void => {
    mintRecords.length = 0;
  };

  return { layout: addMintworks, clear, update };
};