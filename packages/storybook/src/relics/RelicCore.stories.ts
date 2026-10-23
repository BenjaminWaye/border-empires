import type { Meta, StoryObj } from "@storybook/html-vite";
import { Light, Vector3 } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { createAtmosphere } from "@client/client-map-3d-atmosphere.js";
import { createHeightfield } from "@client/client-map-3d-heightfield/client-map-3d-heightfield.js";
import { createForest } from "@client/client-map-3d-forest.js";
import { createMountainMassifs } from "@client/client-map-3d-mountain-massif.js";
import { createTownOverlay } from "@client/client-map-3d-town-overlay.js";
import { createWaystationOverlay } from "@client/client-map-3d-waystation-overlay.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";
import { createRelicCoreOverlay } from "./relic-core-overlay.js";
import { createRelicScaleFigure } from "./relic-scale-figure.js";
import { createRelicCapturePreview } from "./relic-capture-preview.js";

type Args = {
  active: boolean;
  context: boolean;
  cameraDistance: number;
  cameraTilt: number;
  ownerColor: string;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({
    width: 1280, height: 760, cameraDistance: args.cameraDistance,
    cameraTilt: args.cameraTilt, background: "#24343a"
  });
  for (const light of stage.scene.children.filter((object) => object instanceof Light)) stage.scene.remove(light);
  const atmosphere = createAtmosphere(stage.scene, stage.renderer);
  const ground = createHeightfield();
  ground.rebuild({
    camX: 100, camY: 100, halfW: 24, halfH: 24,
    worldWidth: 240, worldHeight: 240, tileKindAt: () => "GRASS"
  });
  for (const mesh of [ground.mesh, ground.skirtMesh, ground.gridlines]) {
    mesh.position.set(-0.5, 0, -0.5);
    stage.scene.add(mesh);
  }
  const surfaceYAt = (dx: number, dz: number): number => {
    const x = dx + 100;
    const z = dz + 100;
    return Math.max(ground.elevationAt(x, z), ground.cornerYAt(x, z),
      ground.cornerYAt(x + 1, z), ground.cornerYAt(x, z + 1), ground.cornerYAt(x + 1, z + 1));
  };
  let relicY = surfaceYAt(0, 0);
  for (let z = -1; z <= 1; z += 1) {
    for (let x = -1; x <= 1; x += 1) relicY = Math.max(relicY, surfaceYAt(x, z));
  }

  const relic = createRelicCoreOverlay(stage.scene, 1);
  const capture = createRelicCapturePreview(
    stage.scene, relicY, args.ownerColor
  );
  const scaleFigure = createRelicScaleFigure(stage.scene, relicY);
  const populate = (active: boolean): void => {
    relic.clear();
    relic.addInstance(0, 0, relicY, active);
    relic.commit();
    capture.setCaptured(active);
  };
  populate(args.active);

  const forest = createForest(stage.scene, 24);
  const mountains = createMountainMassifs(stage.scene, 12, {
    isMountainAt: (_x, y) => y === 96,
    isColdAt: () => false, wrapX: (x) => x, wrapY: (y) => y
  });
  const waystation = createWaystationOverlay(stage.scene, 1, atmosphere.buildingEnvironmentTexture);
  const town = createTownOverlay(stage.scene, 1, atmosphere.buildingEnvironmentTexture);
  if (args.context) {
    waystation.addInstance(-3, 0, surfaceYAt(-3, 0), 97, 100, { activated: false });
    town.addInstance(3, 0, surfaceYAt(3, 0), "TOWN", 103, 100);
    for (const [x, z] of [[-5, -2], [-4, -2], [-3, -2], [3, -2], [4, -2], [5, -2], [-5, 2], [5, 2]]) {
      forest.addInstance(x!, z!, surfaceYAt(x!, z!), x! + 100, z! + 100);
    }
    for (let x = -4; x <= 4; x += 1) mountains.addInstance(x, -4, surfaceYAt(x, -4), x + 100, 96);
  }
  forest.commit();
  mountains.commit();
  waystation.commit();
  town.commit();

  const controls = new OrbitControls(stage.camera, stage.canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.minDistance = 2.2;
  controls.maxDistance = 45;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.target.set(0, relicY + 0.55, 0);
  const setView = (distance: number, tilt: number): void => {
    const horizontal = Math.sin(tilt) * distance;
    stage.camera.position.set(horizontal * 0.25, relicY + 0.4 + Math.cos(tilt) * distance, horizontal * 0.968);
    controls.target.set(0, relicY + 0.55, 0);
    controls.update();
  };
  setView(args.cameraDistance, args.cameraTilt);

  let rafId = 0;
  const animate = (): void => {
    const now = performance.now();
    relic.update(now);
    capture.update(now);
    waystation.update(now);
    controls.update();
    rafId = requestAnimationFrame(animate);
  };
  animate();

  const cleanups = [
    () => cancelAnimationFrame(rafId), () => controls.dispose(),
    relic.dispose, capture.dispose, scaleFigure.dispose, waystation.dispose, town.dispose, forest.dispose, mountains.dispose,
    () => stage.scene.remove(ground.mesh, ground.skirtMesh, ground.gridlines), ground.dispose, atmosphere.dispose
  ];
  const container = wrapWithCleanup(stage, cleanups);
  container.style.maxWidth = "1440px";
  container.style.margin = "0 auto";
  const toolbar = document.createElement("div");
  toolbar.style.cssText = "display:flex;align-items:center;flex-wrap:wrap;gap:10px;padding:14px 18px;background:#152126;color:#d5dfd9;font:13px system-ui";
  const title = document.createElement("strong");
  title.textContent = "RELIC ZIGGURAT · 3D PROTOTYPE";
  title.style.cssText = "letter-spacing:.09em;font-size:11px;margin-right:auto";
  toolbar.append(title);
  const button = (label: string, action: () => void): void => {
    const node = document.createElement("button");
    node.textContent = label;
    node.style.cssText = "border:1px solid #405952;background:#203530;color:#d7e9df;padding:7px 12px;border-radius:4px;cursor:pointer;font:inherit";
    node.addEventListener("click", action);
    toolbar.append(node);
  };
  button("Map scale", () => setView(10, 0.68));
  button("Game zoom", () => setView(38, 0.6));
  button("Close view", () => setView(4.2, 0.92));
  button("Top down", () => setView(args.context ? 9 : 4, 0.12));
  button("Human scale", () => { scaleFigure.group.visible = !scaleFigure.group.visible; });
  let active = args.active;
  const toggle = document.createElement("button");
  toggle.style.cssText = "border:1px solid #6bafa1;background:#2b5046;color:#c9fff0;padding:7px 12px;border-radius:4px;cursor:pointer;font:inherit";
  const showState = (): void => {
    toggle.textContent = active ? "Captured" : "Unclaimed";
    toggle.setAttribute("aria-pressed", String(active));
  };
  toggle.addEventListener("click", () => { active = !active; populate(active); showState(); });
  showState();
  toolbar.append(toggle);
  container.prepend(toolbar);

  const caption = document.createElement("div");
  caption.style.cssText = "padding:14px 18px;color:#b9c9c1;background:#152126;font:13px/1.6 system-ui";
  caption.textContent = args.context
    ? "Waystation (left) · Relic core (centre) · Town (right). Drag to orbit · scroll to zoom · toggle capture."
    : "Toggle capture to compare the dormant ruin with its operating lights and raised House banner. Toggle Unclaimed then Captured to replay the hoist.";
  container.append(caption);

  // Labels follow their actual world positions while the camera orbits.
  const labels = args.context ? [["WAYSTATION", -3], ["RELIC CORE", 0], ["TOWN", 3]] as const : [];
  const projected = new Vector3();
  const labelNodes = labels.map(([text, x]) => {
    const label = document.createElement("span");
    label.textContent = text;
    label.style.cssText = "position:absolute;pointer-events:none;transform:translate(-50%,-50%);font:600 10px system-ui;letter-spacing:.12em;color:#eef5de;text-shadow:0 1px 4px #14221b;background:#172c25b8;border:1px solid #66816c70;padding:5px 8px;border-radius:3px";
    container.append(label);
    return { label, x };
  });
  const positionLabels = (): void => {
    stage.camera.updateMatrixWorld();
    const width = stage.canvas.clientWidth;
    const height = stage.canvas.clientHeight;
    for (const { label, x } of labelNodes) {
      projected.set(x, surfaceYAt(x, 0), x === 0 ? 1.55 : 0.95).project(stage.camera);
      label.style.left = `${(projected.x * 0.5 + 0.5) * width}px`;
      label.style.top = `${(-projected.y * 0.5 + 0.5) * height + toolbar.offsetHeight}px`;
      const distant = stage.camera.position.distanceTo(controls.target) > 20;
      label.style.display = distant || Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1 ? "none" : "block";
    }
  };
  controls.addEventListener("change", positionLabels);
  const observer = new ResizeObserver(positionLabels);
  observer.observe(stage.canvas);
  // Reuse the existing detach-safe stage cleanup mechanism for this observer.
  const stopLabels = (): void => { observer.disconnect(); controls.removeEventListener("change", positionLabels); };
  cleanups.push(stopLabels);
  requestAnimationFrame(positionLabels);
  return container;
};

const meta: Meta<Args> = {
  title: "Relics/Buried Core",
  parameters: { layout: "fullscreen" },
  args: { active: false, context: true, cameraDistance: 10, cameraTilt: 0.68, ownerColor: "#3d7fd6" },
  argTypes: {
    active: { name: "Captured", control: "boolean" }, context: { control: "boolean" },
    ownerColor: { control: "color" },
    cameraDistance: { control: { type: "range", min: 2.5, max: 20, step: 0.5 } },
    cameraTilt: { control: { type: "range", min: 0.1, max: 1.4, step: 0.05 } }
  },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const MapPreview: Story = {};
export const CloseUp: Story = { args: { context: false, cameraDistance: 4.2, cameraTilt: 0.92 } };
export const Dormant: Story = { args: { active: false, context: false, cameraDistance: 4.2, cameraTilt: 0.92 } };
export const Captured: Story = { args: { active: true, context: false, cameraDistance: 4.2, cameraTilt: 0.92 } };
export const CapturedOnMap: Story = { args: { active: true } };
