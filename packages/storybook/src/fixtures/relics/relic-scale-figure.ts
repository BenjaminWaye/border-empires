import { BoxGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, type Scene } from "three";

/** Optional 1.7 m figure beside a nominal 2 m door; a scale aid, not an NPC. */
export const createRelicScaleFigure = (scene: Scene, relicY: number): {
  readonly group: Group;
  readonly dispose: () => void;
} => {
  const group = new Group();
  group.name = "relic-human-scale-reference";
  group.position.set(-0.15, relicY + 0.795, 0.32);
  const material = new MeshStandardMaterial({ color: "#c4ab79", roughness: 0.95 });
  const parts = [
    new SphereGeometry(0.009, 8, 6).translate(0, 0.098, 0),
    new BoxGeometry(0.029, 0.045, 0.018).translate(0, 0.065, 0),
    ...[-1, 1].flatMap((side) => [
      new BoxGeometry(0.010, 0.044, 0.012).translate(side * 0.009, 0.022, 0),
      new BoxGeometry(0.008, 0.039, 0.010).translate(side * 0.020, 0.060, 0)
    ])
  ];
  for (const geometry of parts) group.add(new Mesh(geometry, material));
  group.visible = false;
  scene.add(group);
  return { group, dispose: () => {
    scene.remove(group);
    for (const geometry of parts) geometry.dispose();
    material.dispose();
    group.clear();
  } };
};
