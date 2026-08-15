import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  OctahedronGeometry,
  SphereGeometry,
  type BufferGeometry
} from "three";

export type TownTier = "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS";

export const TOWN_TIERS: readonly TownTier[] = ["SETTLEMENT", "TOWN", "CITY", "GREAT_CITY", "METROPOLIS"];

export type TownColorName =
  | "ironDark"
  | "iron"
  | "charcoal"
  | "stone"
  | "stoneLight"
  | "brass"
  | "brassDark"
  | "brassLight"
  | "wood"
  | "woodLight"
  | "slate"
  | "slateLight"
  | "roofRed";

export const TOWN_PALETTE: Record<TownColorName, string> = {
  ironDark: "#2e3138",
  iron: "#454a52",
  charcoal: "#23262b",
  stone: "#8a8478",
  stoneLight: "#b5ae9f",
  brass: "#b3833a",
  brassDark: "#7a5a26",
  brassLight: "#d4a653",
  wood: "#54361f",
  woodLight: "#6b4a30",
  slate: "#4c5663",
  slateLight: "#66707e",
  roofRed: "#8c4030"
};

export type TownMaterialKind = "iron" | "aether" | "amber";

export type TownSlotKey =
  | "cube"
  | "slab"
  | "beam"
  | "pyramid"
  | "cone"
  | "cyl"
  | "cylFlare"
  | "dome"
  | "pipe"
  | "gear"
  | "piston"
  | "aetherLamp"
  | "aetherOrb"
  | "aetherBeam"
  | "amberGlow";

export type TownSlotDef = {
  readonly kind: TownMaterialKind;
  readonly factor: number;
  readonly apex: number;
  readonly makeGeometry: () => BufferGeometry;
};

export const TOWN_SLOT_DEFS: Readonly<Record<TownSlotKey, TownSlotDef>> = {
  cube: { kind: "iron", factor: 25, apex: 0.5, makeGeometry: () => new BoxGeometry(1, 1, 1) },
  slab: { kind: "iron", factor: 16, apex: 0.175, makeGeometry: () => new BoxGeometry(1, 0.35, 1) },
  beam: { kind: "iron", factor: 4, apex: 0.14, makeGeometry: () => new BoxGeometry(1, 0.28, 0.28) },
  pyramid: {
    kind: "iron",
    factor: 6,
    apex: 0.275,
    makeGeometry: () => {
      const g = new ConeGeometry(0.55, 0.55, 4, 1);
      g.rotateY(Math.PI / 4);
      return g;
    }
  },
  cone: { kind: "iron", factor: 6, apex: 0.25, makeGeometry: () => new ConeGeometry(0.5, 0.5, 10, 1) },
  cyl: { kind: "iron", factor: 15, apex: 0.5, makeGeometry: () => new CylinderGeometry(0.27, 0.32, 1, 10, 1) },
  cylFlare: { kind: "iron", factor: 5, apex: 0.25, makeGeometry: () => new CylinderGeometry(0.42, 0.2, 0.5, 10, 1) },
  dome: {
    kind: "iron",
    factor: 9,
    apex: 0.35,
    makeGeometry: () => new SphereGeometry(0.35, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)
  },
  pipe: {
    kind: "iron",
    factor: 4,
    apex: 0.09,
    makeGeometry: () => {
      const g = new CylinderGeometry(0.09, 0.09, 1, 8, 1);
      g.rotateZ(Math.PI / 2);
      return g;
    }
  },
  gear: { kind: "iron", factor: 10, apex: 0.04, makeGeometry: () => new CylinderGeometry(0.19, 0.19, 0.08, 12, 1) },
  piston: { kind: "iron", factor: 16, apex: 0.25, makeGeometry: () => new CylinderGeometry(0.06, 0.06, 0.5, 8, 1) },
  aetherLamp: { kind: "aether", factor: 14, apex: 0.1, makeGeometry: () => new OctahedronGeometry(0.1) },
  aetherOrb: { kind: "aether", factor: 5, apex: 0.085, makeGeometry: () => new SphereGeometry(0.085, 10, 8) },
  aetherBeam: { kind: "aether", factor: 11, apex: 0.03, makeGeometry: () => new BoxGeometry(1, 0.06, 0.06) },
  amberGlow: { kind: "amber", factor: 15, apex: 0.055, makeGeometry: () => new SphereGeometry(0.055, 8, 6) }
};

export type TownPiece = {
  readonly slot: TownSlotKey;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly ry?: number;
  readonly sx?: number;
  readonly sy?: number;
  readonly sz?: number;
  readonly color?: TownColorName;
};

export type PieceList = TownPiece[];

export type TownLayout = {
  readonly name: string;
  readonly pieces: readonly TownPiece[];
};
