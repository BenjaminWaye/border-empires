import { CanvasTexture, CylinderGeometry, Group, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, type Scene } from "three";
import type { RelicMapHint } from "@border-empires/shared";

/** Anonymous transponder beams and survey signatures remain readable over unexplored ground. */
export function createRelicHintOverlay(scene: Scene): {
  clear: () => void; addHint: (hint: RelicMapHint, x: number, z: number) => void; commit: () => void; dispose: () => void;
} {
  const group = new Group(); scene.add(group);
  const beamGeometry = new CylinderGeometry(0.012, 0.065, 3.8, 6).translate(0, 1.9, 0);
  const beamMaterial = new MeshBasicMaterial({ color: "#d3e7be", opacity: 0.32, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
  const beams = new InstancedMesh(beamGeometry, beamMaterial, 9); beams.renderOrder = 120; beams.frustumCulled = false; group.add(beams);
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
    const material = new MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    const mesh = new InstancedMesh(plane, material, 4096); mesh.renderOrder = 121; mesh.frustumCulled = false; group.add(mesh);
    shapes.push({ mesh, material, texture, count: 0 });
  }
  let count = 0; const matrix = new Matrix4();
  const clear = (): void => { count = 0; beams.count = 0; for (const shape of shapes) { shape.count = 0; shape.mesh.count = 0; } };
  const addHint = (hint: RelicMapHint, x: number, z: number): void => {
    matrix.makeTranslation(x, 0.12, z);
    if (hint.kind === "RELIC") { if (count < 9) beams.setMatrixAt(count++, matrix); }
    else {
      const shape = shapes[hint.resource === "TITANIUM" ? 0 : hint.resource === "CRYSTAL" ? 1 : 2]!;
      if (shape.count < 4096) shape.mesh.setMatrixAt(shape.count++, matrix);
    }
  };
  const commit = (): void => { beams.count = count; beams.instanceMatrix.needsUpdate = true; for (const shape of shapes) { shape.mesh.count = shape.count; shape.mesh.instanceMatrix.needsUpdate = true; } };
  const dispose = (): void => { group.removeFromParent(); beams.dispose(); beamGeometry.dispose(); beamMaterial.dispose(); plane.dispose(); for (const shape of shapes) { shape.mesh.dispose(); shape.material.dispose(); shape.texture.dispose(); } group.clear(); };
  clear();
  return { clear, addHint, commit, dispose };
}
