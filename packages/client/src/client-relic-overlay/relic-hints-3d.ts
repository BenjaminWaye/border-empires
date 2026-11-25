import { CanvasTexture, Group, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, type Scene } from "three";
import type { NaturalWonderState, RelicMapHint } from "@border-empires/shared";
import { shouldDrawRelicHint } from "./relic-map-hints.js";

type HintTile = { naturalWonder?: NaturalWonderState | null | undefined } | undefined;

/** Survey signatures over unexplored ground. Transponders and rivals' aether wakes are named plates (relic-site-plates.ts). */
export function createRelicHintOverlay(scene: Scene): {
  clear: () => void; addHint: (hint: RelicMapHint | undefined, tile: HintTile, x: number, z: number, ownerColor?: (ownerId: string) => string | undefined) => void; commit: () => void; dispose: () => void;
} {
  const group = new Group(); scene.add(group);
  const shapes: Array<{ mesh: InstancedMesh; material: MeshBasicMaterial; texture: CanvasTexture; count: number }> = [];
  const plane = new PlaneGeometry(0.32, 0.32).rotateX(-Math.PI / 2);
  for (const label of ["Ti", "Cr", "Um"]) {
    const canvas = document.createElement("canvas"); canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#202b2b"; ctx.strokeStyle = "#b5c4af"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(32, 32, 29, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#eee7cd"; ctx.font = "bold 26px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(label, 32, 33);
    }
    const texture = new CanvasTexture(canvas);
    const material = new MeshBasicMaterial({ toneMapped: false, map: texture, transparent: true, depthTest: false, depthWrite: false });
    const mesh = new InstancedMesh(plane, material, 4096); mesh.renderOrder = 121; mesh.frustumCulled = false; group.add(mesh);
    shapes.push({ mesh, material, texture, count: 0 });
  }
  const matrix = new Matrix4();
  const clear = (): void => { for (const shape of shapes) { shape.count = 0; shape.mesh.count = 0; } };
  const addHint = (hint: RelicMapHint | undefined, tile: HintTile, x: number, z: number, _ownerColor?: (ownerId: string) => string | undefined): void => {
    if (!shouldDrawRelicHint(hint, tile) || hint.kind !== "RESOURCE") return;
    matrix.makeTranslation(x, 0.12, z);
    const shape = shapes[hint.resource === "TITANIUM" ? 0 : hint.resource === "CRYSTAL" ? 1 : 2]!;
    if (shape.count < 4096) shape.mesh.setMatrixAt(shape.count++, matrix);
  };
  const commit = (): void => { for (const shape of shapes) { shape.mesh.count = shape.count; shape.mesh.instanceMatrix.needsUpdate = true; } };
  const dispose = (): void => { group.removeFromParent(); plane.dispose(); for (const shape of shapes) { shape.mesh.dispose(); shape.material.dispose(); shape.texture.dispose(); } group.clear(); };
  clear();
  return { clear, addHint, commit, dispose };
}
