// The part catalogue for the Bastion Master-Die (BMD) module: every geometry
// and material the module is built from, plus the profile constants the
// placement code builds against.
//
// This lives apart from the module itself because a part catalogue is a
// self-contained unit of work — it declares what the armor press is made of,
// and the module file only decides where each piece sits. It is also the only
// place that needs to change when a piece's proportions move.
//
// MAIN_READ: the whole point of this family is one huge armored stamping die
// mounted on the pod — a giant press block that forms the massive standardized
// armor sections required for Titanium Bastions. Two thick opposing metal
// plates sit one over the other with a NARROW gap between them: the lower die
// is integrated straight into the module body, the upper die hangs beneath a
// short oversized hydraulic ram driven by a heavy header bridging two thick
// hydraulic cylinders, and a thin restrained orange heat seam glows in the
// bite where a red-hot armor blank is being stamped. A reinforced feed slot on
// the front funnels raw titanium blanks into the gap. The dies are broad,
// angular slabs of titanium-grey steel so they read as tooling for armor
// segments, not small machine parts — this is the specialized master tooling
// for fortress hulls, distinct from the general metal-working Thermic Forge.
//
// Strong readable silhouette from strategy-game camera distance — rounded pod
// + giant press block + oversized hydraulic ram — in the shared materials of
// the ring: blackened iron, dark steel, titanium-grey steel, aged brass, and a
// restrained orange heat + cyan AFC power accent.
//
// Local axes (shared with every AFC family): +X is FORWARD — the socket's
// outward radial direction — and the rear coupling hangs at -X. The press sits
// centred on the pod with its two hydraulic legs straddling the dies in the Z
// direction (across the pod, tangential to the ring).

import { BoxGeometry, BufferGeometry, CapsuleGeometry, CylinderGeometry, MeshStandardMaterial, TorusGeometry } from "three";

// Pod: the same 0.075 radius capsule every other family docks with.
export const BMD_POD = { y: 0.082, squash: 0.74, radius: 0.075 };
export const BMD_POD_CROWN = BMD_POD.y + (BMD_POD.radius + 0.01) * BMD_POD.squash;
// Lower_Die: the heavy angular armor-bed slab integrated straight into the
// module body — the bottom platen of the press, broad and square-faced so it
// reads as tooling for massive defensive panels.
export const BMD_LOWER_DIE = { w: 0.1, h: 0.022, d: 0.075, y: 0.152 };
// Upper_Die: the thick opposing platen hanging beneath the ram, marginally
// wider than the bed it lands on.
export const BMD_UPPER_DIE = { w: 0.108, h: 0.016, d: 0.078, y: 0.187 };
// The NARROW gap between the platens where a blank is stamped.
export const BMD_GAP = BMD_UPPER_DIE.y - BMD_UPPER_DIE.h * 0.5 - (BMD_LOWER_DIE.y + BMD_LOWER_DIE.h * 0.5);
// Heat_Seam: the restrained orange glow of the red-hot armor blank held in the
// bite, exactly mid-gap — the only heat the module shows, so it reads as a
// working press rather than a smelter.
export const BMD_SEAM = { w: 0.062, h: 0.005, d: 0.052, y: 0.171 };
// Ram: the short oversized hydraulic ram sitting directly on the upper die and
// hanging under the header — fatter than the frame legs, so the whole press
// reads as a mean machine that stamps full armor plates.
export const BMD_RAM = { radius: 0.02, length: 0.03, y: 0.21 };
// Header: the heavy crown bridging the two hydraulic legs across the press,
// resting its weight straight down through the ram onto the dies.
export const BMD_HEADER = { w: 0.11, h: 0.022, d: 0.14, y: 0.236 };
// Legs: two thick hydraulic cylinders straddling the press in the Z direction,
// carrying the header down to the pod — the press frame.
export const BMD_LEG = { radius: 0.016, z: 0.05, center: 0.1865, length: 0.077 };
// Brass caps seated on each leg where it meets the header.
export const BMD_LEG_CAP = { radius: 0.018, length: 0.008, y: 0.2305 };
// Brass collar around the top of the ram where it joins the header.
export const BMD_RAM_COLLAR = { radius: 0.0215, tube: 0.0045, y: 0.2215 };
// Feed_Slot: one reinforced titanium-grey tray on the front feeding raw blanks
// into the gap, edged by two brass cheeks.
export const BMD_FEED = { w: 0.026, h: 0.01, d: 0.046, x: 0.056, y: 0.168 };
export const BMD_FEED_CHEEK = { w: 0.02, h: 0.012, d: 0.012, z: 0.024 };
// Rear_Coupling: the heavy AFC connector, exactly as on every other family.
export const BMD_COUPLING = { length: 0.05, y: 0.085, stub: -0.058, ring: -0.056, tip: -0.088 };
export const BMD_COUPLING_TIP = { length: 0.016, radius: 0.014 };
// The module's tallest point: the peak of the crown header, 0.247 local =
// 0.3285 world, under the 0.34 ceiling.
export const BMD_TOWER_TOP = BMD_HEADER.y + BMD_HEADER.h * 0.5;

export type BastionMasterDieMaterials = {
  readonly iron: MeshStandardMaterial;
  readonly steel: MeshStandardMaterial;
  // The titanium-grey armour steel the dies and the feed slot are tooled from —
  // distinctly lighter than the dark iron body, so the giant press block pops.
  readonly steelTitan: MeshStandardMaterial;
  readonly brass: MeshStandardMaterial;
  // The family's restrained heat accent: the glowing seam of the red-hot armor
  // blank in the press bite. Never bright enough to outshine the metals.
  readonly orange: MeshStandardMaterial;
  // The cyan AFC power accent on the rear coupling's contact tip, as always.
  readonly cyan: MeshStandardMaterial;
};

export type BastionMasterDieGeometries = {
  readonly base: BufferGeometry;
  readonly baseRing: BufferGeometry;
  readonly pod: BufferGeometry;
  readonly podBand: BufferGeometry;
  readonly lowerDie: BufferGeometry;
  readonly upperDie: BufferGeometry;
  readonly seam: BufferGeometry;
  readonly ram: BufferGeometry;
  readonly ramCollar: BufferGeometry;
  readonly header: BufferGeometry;
  readonly leg: BufferGeometry;
  readonly legCap: BufferGeometry;
  readonly feed: BufferGeometry;
  readonly feedCheek: BufferGeometry;
  readonly coupling: BufferGeometry;
  readonly couplingRing: BufferGeometry;
  readonly couplingTip: BufferGeometry;
};

export type BastionMasterDieParts = {
  readonly geometries: BastionMasterDieGeometries;
  readonly materials: BastionMasterDieMaterials;
};

export const createBastionMasterDieParts = (): BastionMasterDieParts => {
  const iron = new MeshStandardMaterial({ color: "#22242a", roughness: 0.5, metalness: 0.55, flatShading: true });
  const steel = new MeshStandardMaterial({ color: "#17181d", roughness: 0.62, metalness: 0.5, flatShading: true });
  const steelTitan = new MeshStandardMaterial({ color: "#8e9497", roughness: 0.42, metalness: 0.72, flatShading: true });
  const brass = new MeshStandardMaterial({ color: "#8b6c3d", roughness: 0.42, metalness: 0.85, flatShading: true });
  const orange = new MeshStandardMaterial({
    color: "#1c1107",
    roughness: 0.4,
    metalness: 0.1,
    flatShading: true,
    emissive: "#ff8a3d",
    emissiveIntensity: 0.65
  });
  const cyan = new MeshStandardMaterial({
    color: "#0d2430",
    roughness: 0.32,
    metalness: 0.15,
    flatShading: true,
    emissive: "#37b6d6",
    emissiveIntensity: 1.0
  });

  // Small curved parts use high segment counts so flat-shaded facets never read
  // as black crease lines (see the Siege Lens Foundry module notes).
  return {
    materials: { iron, steel, steelTitan, brass, orange, cyan },
    geometries: {
      base: new CylinderGeometry(0.1, 0.105, 0.032, 16),
      baseRing: new TorusGeometry(0.12, 0.012, 12, 28),
      pod: new CapsuleGeometry(BMD_POD.radius, 0.02, 6, 16),
      podBand: new TorusGeometry(0.079, 0.011, 10, 26),
      // The giant press block: the two opposing armored platen slabs and the
      // heat seam between them.
      lowerDie: new BoxGeometry(BMD_LOWER_DIE.w, BMD_LOWER_DIE.h, BMD_LOWER_DIE.d),
      upperDie: new BoxGeometry(BMD_UPPER_DIE.w, BMD_UPPER_DIE.h, BMD_UPPER_DIE.d),
      seam: new BoxGeometry(BMD_SEAM.w, BMD_SEAM.h, BMD_SEAM.d),
      // The oversized ram and the crown header that drives it.
      ram: new CylinderGeometry(BMD_RAM.radius, BMD_RAM.radius, 1, 16),
      ramCollar: new TorusGeometry(BMD_RAM_COLLAR.radius, BMD_RAM_COLLAR.tube, 10, 20),
      header: new BoxGeometry(BMD_HEADER.w, BMD_HEADER.h, BMD_HEADER.d),
      // The two hydraulic legs and their brass caps.
      leg: new CylinderGeometry(BMD_LEG.radius, BMD_LEG.radius, 1, 12),
      legCap: new CylinderGeometry(BMD_LEG_CAP.radius, BMD_LEG_CAP.radius, 1, 12),
      // The reinforced feed slot on the front.
      feed: new BoxGeometry(BMD_FEED.w, BMD_FEED.h, BMD_FEED.d),
      feedCheek: new BoxGeometry(BMD_FEED_CHEEK.w, BMD_FEED_CHEEK.h, BMD_FEED_CHEEK.d),
      // Rear coupling, as on every other family.
      coupling: new CylinderGeometry(0.024, 0.026, 1, 12),
      couplingRing: new TorusGeometry(0.03, 0.011, 10, 20),
      couplingTip: new CylinderGeometry(BMD_COUPLING_TIP.radius, BMD_COUPLING_TIP.radius, 0.016, 14)
    }
  };
};