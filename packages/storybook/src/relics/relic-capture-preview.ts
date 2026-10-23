import { BoxGeometry, Color, Group, Mesh, MeshBasicMaterial, Scene } from "three";

export type RelicCapturePreview = {
  readonly setCaptured: (captured: boolean) => void;
  readonly dispose: () => void;
};

/** A small House marker attached to the surviving summit bulkhead. */
export const createRelicCapturePreview = (
  scene: Scene,
  relicY: number,
  ownerColor: string
): RelicCapturePreview => {
  const color = new Color(ownerColor);
  const marker = new Group();
  marker.name = "relic-captured-house-marker";
  const frameGeometry = new BoxGeometry(0.16, 0.06, 0.025);
  const faceGeometry = new BoxGeometry(0.13, 0.035, 0.01);
  const sigilGeometry = new BoxGeometry(0.016, 0.016, 0.006);
  const frameMaterial = new MeshBasicMaterial({ color: "#263138" });
  const ownerMaterial = new MeshBasicMaterial({ color, toneMapped: false });
  const sigilMaterial = new MeshBasicMaterial({ color: "#d7e1cf", toneMapped: false });
  const frame = new Mesh(frameGeometry, frameMaterial);
  const face = new Mesh(faceGeometry, ownerMaterial);
  const sigil = new Mesh(sigilGeometry, sigilMaterial);
  face.position.z = 0.017;
  sigil.position.z = 0.025;
  sigil.rotation.z = Math.PI / 4;
  marker.add(frame, face, sigil);
  marker.position.set(0, relicY + 0.952, 0.27);
  scene.add(marker);

  const setCaptured = (captured: boolean): void => {
    marker.visible = captured;
  };

  const dispose = (): void => {
    scene.remove(marker);
    for (const geometry of [frameGeometry, faceGeometry, sigilGeometry]) geometry.dispose();
    for (const material of [frameMaterial, ownerMaterial, sigilMaterial]) material.dispose();
    marker.clear();
  };
  return { setCaptured, dispose };
};
