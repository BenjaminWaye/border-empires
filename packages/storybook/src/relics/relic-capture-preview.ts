import { BoxGeometry, Color, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Scene } from "three";

export type RelicCapturePreview = {
  readonly setCaptured: (captured: boolean) => void;
  readonly dispose: () => void;
};

/** Attached House panels keep capture readable when the base hides its tile. */
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
  const panelMaterial = new MeshStandardMaterial({
    color, roughness: 0.94, metalness: 0, emissive: color, emissiveIntensity: 0.12
  });
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

  const panels = new Group();
  panels.name = "relic-captured-terrace-panels";
  panels.position.y = relicY;
  const panelFrameGeometry = new BoxGeometry(0.58, 0.14, 0.025);
  const panelFaceGeometry = new BoxGeometry(0.53, 0.10, 0.012);
  const topPanelGeometry = new BoxGeometry(0.53, 0.012, 0.19);
  const stairFrameGeometry = new BoxGeometry(0.26, 0.14, 0.025);
  const stairFaceGeometry = new BoxGeometry(0.22, 0.10, 0.012);
  const stairTopGeometry = new BoxGeometry(0.22, 0.012, 0.19);
  for (let side = 0; side < 4; side += 1) {
    const panel = new Group();
    panel.rotation.y = side * Math.PI / 2;
    // Leave the service stair clear instead of putting a panel across it.
    for (const x of side === 0 ? [-0.35, 0.35] : [0]) {
      const backing = new Mesh(side === 0 ? stairFrameGeometry : panelFrameGeometry, frameMaterial);
      const colour = new Mesh(side === 0 ? stairFaceGeometry : panelFaceGeometry, panelMaterial);
      const top = new Mesh(side === 0 ? stairTopGeometry : topPanelGeometry, panelMaterial);
      backing.position.set(x, 0.52, 0.606);
      colour.position.set(x, 0.52, 0.625);
      // An upward-facing section stays visible from the steep gameplay camera.
      top.position.set(x, 0.635, 0.52);
      panel.add(backing, colour, top);
    }
    panels.add(panel);
  }
  scene.add(panels);

  const setCaptured = (captured: boolean): void => {
    marker.visible = captured;
    panels.visible = captured;
  };

  const dispose = (): void => {
    scene.remove(marker, panels);
    for (const geometry of [frameGeometry, faceGeometry, sigilGeometry,
      panelFrameGeometry, panelFaceGeometry, topPanelGeometry,
      stairFrameGeometry, stairFaceGeometry, stairTopGeometry]) geometry.dispose();
    for (const material of [frameMaterial, ownerMaterial, panelMaterial, sigilMaterial]) material.dispose();
    marker.clear();
    panels.clear();
  };
  return { setCaptured, dispose };
};
