import {
  BoxGeometry,
  CylinderGeometry,
  MeshStandardMaterial,
  OctahedronGeometry,
  SphereGeometry,
  TorusGeometry
} from "three";
import type { StructurePieceBuilder } from "./client-map-3d-structure-builder.js";

// The Astral Dock is built from three uniquely-named components, each a
// real, distinct wire type (unique-monument-components rewrite):
// ASTRAL_DOCK_PART_1 (Launch Cradle), ASTRAL_DOCK_PART_2 (Orbital Array),
// ASTRAL_DOCK_PART_3 (Aether Sail).
export type AstralDockPartStructureKind =
  | "ASTRAL_DOCK_PART_1"
  | "ASTRAL_DOCK_PART_2"
  | "ASTRAL_DOCK_PART_3";

export const ASTRAL_DOCK_PART_STRUCTURE_KINDS: ReadonlySet<AstralDockPartStructureKind> = new Set([
  "ASTRAL_DOCK_PART_1",
  "ASTRAL_DOCK_PART_2",
  "ASTRAL_DOCK_PART_3"
]);

export type AstralDockPartStructureLayout = (
  sceneX: number,
  surfaceY: number,
  sceneZ: number
) => void;

export type AstralDockPartHandle = {
  readonly layouts: Record<AstralDockPartStructureKind, AstralDockPartStructureLayout>;
};

export const registerAstralDockPartStructures = (
  builder: StructurePieceBuilder
): AstralDockPartHandle => {
  const C = builder.maxTiles;

  // ─── Part palette ───────────────────────────────────────────────────
  // The Astral Dock reads as a cold aether launch monument: soot-dark
  // violet-tinged iron, aged/weathered brass, cool grey mechanical
  // joints, and a muted grey-blue sail panel. Each part carries exactly
  // one small restrained emissive accent in the monument's aether
  // palette — violet-cyan guide lights on the cradle, the violet dish
  // receiver, and the violet sail markings/trim. No saturated colors.
  const adIronMaterial = new MeshStandardMaterial({ color: "#26202e", roughness: 0.85, metalness: 0.35, flatShading: true });
  const adIronDarkMaterial = new MeshStandardMaterial({ color: "#1c1724", roughness: 0.88, metalness: 0.4, flatShading: true });
  const adBrassMaterial = new MeshStandardMaterial({ color: "#9e7130", roughness: 0.55, metalness: 0.5, flatShading: true });
  const adBrassDarkMaterial = new MeshStandardMaterial({ color: "#6e521f", roughness: 0.6, metalness: 0.5, flatShading: true });
  const adGreyMaterial = new MeshStandardMaterial({ color: "#6e6e7c", roughness: 0.85, metalness: 0.15, flatShading: true });
  const adGreyDarkMaterial = new MeshStandardMaterial({ color: "#575766", roughness: 0.88, metalness: 0.15, flatShading: true });
  const adSailMaterial = new MeshStandardMaterial({ color: "#6f7a92", roughness: 0.9, metalness: 0.05, flatShading: true });
  const adGuideMaterial = new MeshStandardMaterial({ color: "#9ec8f0", roughness: 0.3, metalness: 0.1, flatShading: true, emissive: "#5f6ad0", emissiveIntensity: 0.95 });
  const adVioletMaterial = new MeshStandardMaterial({ color: "#c08aff", roughness: 0.3, metalness: 0.1, flatShading: true, emissive: "#7a3acc", emissiveIntensity: 0.85 });

  // ─── Geometries ─────────────────────────────────────────────────────
  // Launch Cradle
  const lcBaseGeo = new BoxGeometry(0.34, 0.05, 0.30);
  const lcBraceGeo = new BoxGeometry(0.04, 0.05, 0.20);
  const lcBracketGeo = new BoxGeometry(0.045, 0.05, 0.04);
  const lcJointGeo = new BoxGeometry(0.032, 0.032, 0.032);
  const lcRailGeo = new TorusGeometry(0.15, 0.02, 6, 16, Math.PI * 0.95);
  const lcGuideGeo = new OctahedronGeometry(0.014, 0);
  // Orbital Array
  const oaBaseGeo = new CylinderGeometry(0.09, 0.11, 0.045, 10);
  const oaCollarGeo = new CylinderGeometry(0.03, 0.035, 0.02, 8);
  const oaMastGeo = new CylinderGeometry(0.012, 0.02, 0.26, 8);
  const oaHubGeo = new CylinderGeometry(0.03, 0.03, 0.04, 8);
  const oaArmGeo = new CylinderGeometry(0.007, 0.007, 0.13, 6);
  const oaDishGeo = new SphereGeometry(0.15, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.35);
  const oaReceiverGeo = new OctahedronGeometry(0.026, 0);
  // Aether Sail
  const asBaseGeo = new CylinderGeometry(0.09, 0.11, 0.045, 10);
  const asCollarGeo = new CylinderGeometry(0.03, 0.035, 0.02, 8);
  const asMastGeo = new CylinderGeometry(0.012, 0.018, 0.40, 8);
  const asPanelGeo = new CylinderGeometry(0.135, 0.135, 0.014, 3);
  const asFrameGeo = new CylinderGeometry(0.138, 0.138, 0.012, 3, 1, true);
  const asRibGeo = new BoxGeometry(0.012, 0.012, 0.10);
  const asRibNarrowGeo = new BoxGeometry(0.012, 0.012, 0.07);
  const asJointGeo = new BoxGeometry(0.022, 0.022, 0.022);
  const asMarkGeo = new OctahedronGeometry(0.014, 0);
  const asTrimGeo = new BoxGeometry(0.006, 0.006, 0.234);

  builder.makeSlot("lcBase", lcBaseGeo, adIronMaterial, C);
  builder.makeSlot("lcBrace", lcBraceGeo, adIronDarkMaterial, C);
  builder.makeSlot("lcBracket", lcBracketGeo, adIronDarkMaterial, C * 4);
  builder.makeSlot("lcJoint", lcJointGeo, adGreyMaterial, C * 5);
  builder.makeSlot("lcRail", lcRailGeo, adBrassMaterial, C * 2);
  builder.makeSlot("lcGuide", lcGuideGeo, adGuideMaterial, C * 6);
  builder.makeSlot("oaBase", oaBaseGeo, adIronMaterial, C);
  builder.makeSlot("oaCollar", oaCollarGeo, adGreyMaterial, C);
  builder.makeSlot("oaMast", oaMastGeo, adIronMaterial, C);
  builder.makeSlot("oaHub", oaHubGeo, adBrassMaterial, C);
  builder.makeSlot("oaArm", oaArmGeo, adBrassMaterial, C * 4);
  builder.makeSlot("oaDish", oaDishGeo, adGreyDarkMaterial, C);
  builder.makeSlot("oaReceiver", oaReceiverGeo, adVioletMaterial, C);
  builder.makeSlot("asBase", asBaseGeo, adIronMaterial, C);
  builder.makeSlot("asCollar", asCollarGeo, adGreyMaterial, C);
  builder.makeSlot("asMast", asMastGeo, adIronMaterial, C);
  builder.makeSlot("asPanel", asPanelGeo, adSailMaterial, C);
  builder.makeSlot("asFrame", asFrameGeo, adBrassMaterial, C);
  builder.makeSlot("asRib", asRibGeo, adGreyMaterial, C);
  builder.makeSlot("asRibNarrow", asRibNarrowGeo, adGreyMaterial, C);
  builder.makeSlot("asJoint", asJointGeo, adBrassDarkMaterial, C * 3);
  builder.makeSlot("asMark", asMarkGeo, adVioletMaterial, C * 2);
  builder.makeSlot("asTrim", asTrimGeo, adVioletMaterial, C);

  const addLaunchCradle: AstralDockPartStructureLayout = (sx, sy, sz) => {
    // A compact curved launch berth: two parallel brass U-rails (torus
    // arcs in vertical ring planes, offset along Z) resting on a heavy
    // iron platform, tilted forward slightly (rotX 0.1) so the open
    // mouth of the cradle points up toward the sky. Dark-iron foot
    // brackets and a central cross-brace support the rails, grey joint
    // blocks mark the four feet and the center, and three violet-cyan
    // guide lights run along each rail. The center stays open — the
    // berth where a spacecraft would rest before launch.
    builder.addPiece("lcBase", sx, sy, sz, 0, 0.025, 0);
    builder.addPiece("lcBrace", sx, sy, sz, 0, 0.05, 0);
    builder.addPiece("lcRail", sx, sy, sz, 0, 0.06, 0.11, 1, 1, 1, 0, 0.1, 0);
    builder.addPiece("lcRail", sx, sy, sz, 0, 0.06, -0.11, 1, 1, 1, 0, 0.1, 0);
    const feet: ReadonlyArray<readonly [number, number]> = [
      [0.15, 0.11],
      [0.15, -0.11],
      [-0.15, 0.11],
      [-0.15, -0.11]
    ];
    for (const [fx, fz] of feet) {
      builder.addPiece("lcBracket", sx, sy, sz, fx, 0.045, fz);
      builder.addPiece("lcJoint", sx, sy, sz, fx, 0.06, fz);
    }
    builder.addPiece("lcJoint", sx, sy, sz, 0, 0.085, 0);
    // Guide lights along each rail: one on each side and one at the top
    // of the arc (torus angles 45/90/135 deg). The rails are tilted
    // rotX 0.1 about their own center (0, 0.06, +/-0.11), so the light
    // positions are those arc points rotated by the same tilt.
    const guideOffsets: ReadonlyArray<readonly [number, number, number]> = [
      [0.106, 0.1655, 0.1206],
      [0, 0.2093, 0.125],
      [-0.106, 0.1655, 0.1206],
      [0.106, 0.1655, -0.0994],
      [0, 0.2093, -0.095],
      [-0.106, 0.1655, -0.0994]
    ];
    for (const [gx, gy, gz] of guideOffsets) {
      builder.addPiece("lcGuide", sx, sy, sz, gx, gy, gz);
    }
  };

  const addOrbitalArray: AstralDockPartStructureLayout = (sx, sy, sz) => {
    // A slim communications mast: compact iron base with a grey collar,
    // a narrow tapered iron mast, a brass hub, then a wide shallow
    // grey dish (a clipped sphere top-cap, matching the radar idiom)
    // tilted slightly up toward the sky with four thin brass arms
    // bracing it from the hub. The single focal accent is the small
    // faceted violet receiver at the exact center of the dish.
    builder.addPiece("oaBase", sx, sy, sz, 0, 0.0225, 0);
    builder.addPiece("oaCollar", sx, sy, sz, 0, 0.05, 0);
    builder.addPiece("oaMast", sx, sy, sz, 0, 0.15, 0);
    builder.addPiece("oaHub", sx, sy, sz, 0, 0.28, 0);
    builder.addPiece("oaArm", sx, sy, sz, 0, 0.28, 0.06, 1, 1, 1, 0, 0.5, 0);
    builder.addPiece("oaArm", sx, sy, sz, 0, 0.28, -0.06, 1, 1, 1, 0, -0.5, 0);
    builder.addPiece("oaArm", sx, sy, sz, 0.06, 0.28, 0, 1, 1, 1, 0, 0, -0.5);
    builder.addPiece("oaArm", sx, sy, sz, -0.06, 0.28, 0, 1, 1, 1, 0, 0, 0.5);
    builder.addPiece("oaDish", sx, sy, sz, 0, 0.30, 0, 1, 1, 1, 0, -0.15, 0);
    builder.addPiece("oaReceiver", sx, sy, sz, 0, 0.30, 0, 1, 1, 1, 0, -0.15, 0);
  };

  const addAetherSail: AstralDockPartStructureLayout = (sx, sy, sz) => {
    // A compact folded triangular propulsion sail: a thin iron mast on a
    // small base carrying a triangular grey-blue sail panel. The panel is
    // a three-segment cylinder slab stood on its point (mount rotZ PI/2
    // maps its local X axis up, so the triangle ends up in the YZ plane,
    // apex-up, centered at (0, 0.245, 0) — the mast plane). Around it, an
    // open-ended brass triangular tube of slightly larger radius forms
    // the reinforced frame; two grey ribs cross the face horizontally and
    // dark-brass joint cubes mark the three corners — apex at y 0.38 and
    // base corners at y 0.1775, z +/-0.1169. The sail carries restrained
    // violet markings — a trim bar along the base edge and two faceted
    // dots on the face. All sail pieces share the same mount rotation so
    // panel, frame, ribs, joints, and markings stay coplanar.
    builder.addPiece("asBase", sx, sy, sz, 0, 0.0225, 0);
    builder.addPiece("asCollar", sx, sy, sz, 0, 0.05, 0);
    builder.addPiece("asMast", sx, sy, sz, 0, 0.20, 0);
    builder.addPiece("asPanel", sx, sy, sz, 0, 0.245, 0, 1, 1, 1, 0, 0, Math.PI * 0.5);
    builder.addPiece("asFrame", sx, sy, sz, 0, 0.245, 0, 1, 1, 1, 0, 0, Math.PI * 0.5);
    builder.addPiece("asRib", sx, sy, sz, 0, 0.265, 0, 1, 1, 1, 0, 0, Math.PI * 0.5);
    builder.addPiece("asRibNarrow", sx, sy, sz, 0, 0.315, 0, 1, 1, 1, 0, 0, Math.PI * 0.5);
    builder.addPiece("asJoint", sx, sy, sz, 0, 0.38, 0);
    builder.addPiece("asJoint", sx, sy, sz, 0, 0.1775, -0.1169);
    builder.addPiece("asJoint", sx, sy, sz, 0, 0.1775, 0.1169);
    builder.addPiece("asTrim", sx, sy, sz, 0, 0.1775, 0, 1, 1, 1, 0, 0, Math.PI * 0.5);
    builder.addPiece("asMark", sx, sy, sz, 0.01, 0.245, 0.02);
    builder.addPiece("asMark", sx, sy, sz, 0.01, 0.305, -0.035);
  };

  return {
    layouts: {
      ASTRAL_DOCK_PART_1: addLaunchCradle,
      ASTRAL_DOCK_PART_2: addOrbitalArray,
      ASTRAL_DOCK_PART_3: addAetherSail
    }
  };
};
