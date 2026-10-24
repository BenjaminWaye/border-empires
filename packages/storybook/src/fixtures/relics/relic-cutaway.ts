import { Vector3 } from "three";
import { createStage, wrapWithCleanup } from "../three-stage.js";
import { createRelicCoreOverlay } from "./relic-core-overlay.js";
import { createRelicCapturePreview } from "./relic-capture-preview.js";
import { createRelicUnderground, type RelicInstallation } from "./relic-underground-geometry.js";

export const createRelicCutaway = (kind: RelicInstallation, ownerColor: string): {
  readonly element: HTMLElement;
  readonly setSection: (visible: boolean) => void;
} => {
  const stage = createStage({ width: 960, height: 500, camera: "orthographic", orthoHalfHeight: 1.95 });
  stage.renderer.setClearColor("#141a16", 0);
  stage.camera.position.set(3.5, 2.6, 6.5);
  stage.camera.lookAt(0, 0.12, 0);
  stage.camera.updateMatrixWorld();
  const relic = createRelicCoreOverlay(stage.scene, 1);
  relic.addInstance(0, 0, 0, true);
  relic.commit();
  const banner = createRelicCapturePreview(stage.scene, 0, ownerColor);
  banner.setCaptured(true);
  const installation = createRelicUnderground(kind);
  stage.scene.add(installation.group);
  let raf = 0;
  const animate = (): void => {
    const now = performance.now();
    relic.update(now);
    banner.update(now);
    raf = requestAnimationFrame(animate);
  };
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) animate();
  const element = wrapWithCleanup(stage, [() => cancelAnimationFrame(raf), relic.dispose, banner.dispose, installation.dispose]);
  element.className = "relic-cutaway";
  element.style.background = "transparent";
  stage.canvas.setAttribute("role", "img");
  stage.canvas.setAttribute("aria-label", kind === "WARPRESS"
    ? "Cutaway: the captured ziggurat above ground connects by a service shaft to three armour assembly cradles, a conveyor and a surviving power unit underground."
    : "Cutaway: the captured ziggurat above ground connects by a service shaft to a buried computation vault with four banks of calculating machinery and a surviving power unit.");

  const annotations: { node: HTMLElement; underground: boolean }[] = [];
  const label = (number: string, title: string, detail: string, point: Vector3, underground: boolean, side: "left" | "right"): void => {
    point.project(stage.camera);
    const node = document.createElement("div");
    node.className = `relic-cutaway-label relic-cutaway-label--${side}`;
    node.style.top = `${(-point.y * 0.5 + 0.5) * 100}%`;
    node.innerHTML = `<span>${number}</span><div><strong>${title}</strong><small>${detail}</small></div>`;
    element.append(node);
    annotations.push({ node, underground });
  };
  label("01", "Surface access", "The shared ziggurat", new Vector3(-1.0, 0.95, 0), false, "left");
  label("02", "Service shaft", "Access to the old works", new Vector3(1.3, -0.14, 0), true, "right");
  label("03", kind === "WARPRESS" ? "Armour assembly" : "Computation vault",
    kind === "WARPRESS" ? "Surviving production line" : "Surviving calculation banks", new Vector3(0, -1.36, 0.2), true, "left");
  const setSection = (visible: boolean): void => {
    installation.machinery.visible = visible;
    installation.closedFace.visible = !visible;
    for (const annotation of annotations) annotation.node.hidden = annotation.underground && !visible;
    element.classList.toggle("relic-cutaway--closed", !visible);
    stage.canvas.setAttribute("aria-label", visible
      ? (kind === "WARPRESS"
        ? "Cutaway showing the captured ziggurat, service shaft, buried armour assembly line and surviving power unit."
        : "Cutaway showing the captured ziggurat, service shaft, buried computation banks and surviving power unit.")
      : "The captured ziggurat above a solid section of ground; the underground machinery is hidden.");
  };
  return { element, setSection };
};
