import {
  BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, type BufferGeometry
} from "three";

export type RelicInstallation = "WARPRESS" | "CALCULATING_ENGINE";

/** A diagrammatic section through the buried installation, not new map geometry. */
export const createRelicUnderground = (kind: RelicInstallation): {
  readonly group: Group;
  readonly closedFace: Group;
  readonly machinery: Group;
  readonly dispose: () => void;
} => {
  const group = new Group();
  const machinery = new Group();
  const closedFace = new Group();
  group.add(machinery, closedFace);
  const materials = {
    soil: new MeshStandardMaterial({ color: "#5b5140", roughness: 1 }),
    rock: new MeshStandardMaterial({ color: "#353e39", roughness: 1 }),
    shell: new MeshStandardMaterial({ color: "#737e78", roughness: 0.91 }),
    metal: new MeshStandardMaterial({ color: "#323f40", roughness: 0.62, metalness: 0.22 }),
    brass: new MeshStandardMaterial({ color: "#b69a62", roughness: 0.66, metalness: 0.22 }),
    glow: new MeshStandardMaterial({ color: "#b7d0ad", emissive: "#a8c99b", emissiveIntensity: 0.55 }),
    heat: new MeshStandardMaterial({ color: "#d7aa69", emissive: "#c58440", emissiveIntensity: 0.6 })
  };
  const geometries: BufferGeometry[] = [];
  type MaterialKey = keyof typeof materials;
  const part = (geometry: BufferGeometry, material: MaterialKey, parent: Group = machinery): Mesh => {
    geometries.push(geometry);
    const mesh = new Mesh(geometry, materials[material]);
    parent.add(mesh);
    return mesh;
  };
  const box = (w: number, h: number, d: number, x: number, y: number, z: number,
    material: MaterialKey, parent: Group = machinery): Mesh =>
    part(new BoxGeometry(w, h, d).translate(x, y, z), material, parent);

  // The front face is removed in section; the back and sides keep real thickness.
  box(4.1, 0.10, 1.65, 0, -0.055, -0.18, "soil", group);
  box(4.1, 0.13, 1.65, 0, -1.43, -0.18, "rock", group);
  for (const side of [-1, 1]) {
    box(0.48, 1.30, 1.65, side * 1.81, -0.75, -0.18, "soil", group);
    for (let layer = 0; layer < 4; layer += 1) {
      box(0.49, 0.028, 1.66, side * 1.81, -0.25 - layer * 0.27, -0.18, "rock", group);
    }
  }
  box(3.2, 1.30, 0.16, 0, -0.75, -0.93, "rock", group);
  box(3.2, 1.30, 0.16, 0, -0.75, 0.57, "soil", closedFace);

  // Reinforced hall, with the near wall omitted so the machinery is legible.
  box(3.1, 0.07, 1.24, 0, -1.31, -0.14, "shell");
  box(3.1, 0.07, 1.24, 0, -0.27, -0.14, "shell");
  for (const x of [-1.42, 1.42]) {
    box(0.075, 1.02, 0.09, x, -0.79, 0.40, "metal");
    box(0.075, 1.02, 0.09, x, -0.79, -0.68, "metal");
  }
  // A lift and conduits connect the common surface building to the buried hall.
  for (const x of [0.91, 1.13]) box(0.026, 0.91, 0.026, x, -0.49, 0.40, "brass");
  box(0.26, 0.035, 0.29, 1.02, -0.86, 0.40, "metal");
  for (let step = 0; step < 7; step += 1) box(0.16, 0.012, 0.018, 1.02, -0.10 - step * 0.1, 0.40, "brass");
  box(0.036, 0.74, 0.04, 1.20, -0.50, 0.40, "glow");

  // Common surviving power unit on the left, fed into the hall floor.
  part(new CylinderGeometry(0.13, 0.15, 0.48, 12).translate(-1.20, -1.03, -0.18), "metal");
  for (const y of [-1.22, -1.02, -0.82]) {
    part(new CylinderGeometry(0.145, 0.145, 0.025, 12).translate(-1.20, y, -0.18), "glow");
  }
  box(2.7, 0.025, 0.03, 0, -1.24, 0.25, "brass");

  if (kind === "WARPRESS") {
    for (const x of [-0.72, -0.10, 0.52]) {
      box(0.53, 0.055, 0.48, x, -1.23, -0.15, "metal");
      for (const side of [-1, 1]) box(0.035, 0.62, 0.04, x + side * 0.23, -0.91, -0.32, "shell");
      box(0.52, 0.06, 0.07, x, -0.60, -0.32, "brass");
      // Empty advanced armour held in an assembly cradle.
      box(0.17, 0.22, 0.12, x, -0.86, -0.15, "shell");
      box(0.095, 0.085, 0.095, x, -0.70, -0.15, "metal");
      for (const side of [-1, 1]) {
        box(0.055, 0.22, 0.08, x + side * 0.058, -1.08, -0.15, "shell");
        part(new BoxGeometry(0.045, 0.17, 0.055).rotateZ(side * 0.25)
          .translate(x + side * 0.14, -0.85, -0.15), "metal");
      }
      box(0.06, 0.065, 0.02, x, -0.82, -0.08, "heat");
    }
    box(2.45, 0.045, 0.19, 0.02, -1.12, 0.35, "metal");
    for (let roller = 0; roller < 15; roller += 1) {
      part(new CylinderGeometry(0.018, 0.018, 0.17, 6).rotateX(Math.PI / 2)
        .translate(-1.05 + roller * 0.15, -1.09, 0.35), "brass");
    }
  } else {
    for (const x of [-0.72, -0.15, 0.42, 0.99]) {
      box(0.38, 0.63, 0.35, x, -0.95, -0.19, "metal");
      box(0.43, 0.035, 0.40, x, -0.62, -0.19, "shell");
      for (let unit = 0; unit < 6; unit += 1) {
        box(0.30, 0.045, 0.02, x, -0.72 - unit * 0.085, 0.001, "shell");
        box(0.13, 0.012, 0.025, x - 0.04, -0.72 - unit * 0.085, 0.015, "glow");
      }
    }
  }
  closedFace.visible = false;
  return { group, closedFace, machinery, dispose: () => {
    group.removeFromParent();
    for (const geometry of geometries) geometry.dispose();
    for (const material of Object.values(materials)) material.dispose();
    group.clear();
  } };
};
