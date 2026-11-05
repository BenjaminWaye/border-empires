import { DirectionalLight, Mesh, MeshStandardMaterial, OrthographicCamera, PCFSoftShadowMap, PlaneGeometry, PMREMGenerator, Vector3 } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { structureDisplayName } from "@border-empires/shared";
import { createStructureReviewModel, type StructureReviewModel } from "@client/client-structure-info-catalog/structure-review-model.js";
import type { StructureInfoKey } from "@client/client-map-display.js";
import { structureModelBriefFor } from "@client/client-structure-info-catalog/structure-model-briefs.js";
import { createStage, wrapWithCleanup } from "../../fixtures/three-stage.js";
import { CURRENT_DISTRICT_KINDS, RETIRED_DISTRICT_KINDS } from "./town-district-review-kinds.js";

/** One actual production 3D model at a time, using the live map's materials,
 * animation and geometry. The current registry controls the default selection. */
export const renderDistrictIdentityReview = (retired = false): HTMLElement =>
  renderStructureIdentityReview(retired ? RETIRED_DISTRICT_KINDS : CURRENT_DISTRICT_KINDS, retired ? "Retired compatibility structure" : "Current support structure", retired);

export const renderStructureIdentityReview = (kinds: readonly StructureInfoKey[], label = "Current structure", retired = false): HTMLElement => {
  const stage = createStage({ width: 1040, height: 440, camera: "orthographic", orthoHalfHeight: 0.53, background: "#18232b" });
  stage.camera.position.set(1.2, 1, 1.6); stage.camera.lookAt(0, 0.15, 0);
  stage.renderer.shadowMap.enabled = true; stage.renderer.shadowMap.type = PCFSoftShadowMap;
  const sun = stage.scene.children.find((object): object is DirectionalLight => object instanceof DirectionalLight);
  if (sun) {
    sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -1, right: 1, top: 1, bottom: -1, near: 0.1, far: 40 });
    sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.002;
  }
  const room = new RoomEnvironment(), pmrem = new PMREMGenerator(stage.renderer);
  const environment = pmrem.fromScene(room); pmrem.dispose(); room.dispose();
  const groundGeometry = new PlaneGeometry(200, 200).rotateX(-Math.PI / 2);
  const groundMaterial = new MeshStandardMaterial({ color: "#263a36", roughness: 0.92 });
  const ground = new Mesh(groundGeometry, groundMaterial); ground.position.y = -0.105; ground.receiveShadow = true; stage.scene.add(ground);
  let model: StructureReviewModel | undefined;
  const controls = new OrbitControls(stage.camera, stage.canvas);
  controls.target.set(0, 0.15, 0); controls.enableDamping = true; controls.enablePan = false;
  controls.minZoom = 0.6; controls.maxZoom = 2.5; controls.maxPolarAngle = Math.PI * 0.48; controls.update();
  const bar = document.createElement("div");
  bar.style.cssText = "display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:16px;color:#e3d7ba;background:#18232b;font:14px system-ui";
  const select = document.createElement("select");
  select.setAttribute("aria-label", label);
  select.style.cssText = "padding:10px;background:#24363e;color:#f0e5cb;border:1px solid #65716b;font:inherit;max-width:100%";
  for (const kind of kinds) {
    const option = document.createElement("option"); option.value = kind; option.textContent = structureDisplayName(kind); select.appendChild(option);
  }
  const count = document.createElement("span");
  count.textContent = retired ? `${kinds.length} retired save types — not buildable` : `${kinds.length} current structures · drag to orbit · scroll to zoom`;
  const details = document.createElement("div");
  details.style.cssText = "padding:16px 20px 24px;background:#18232b;color:#cbd6d8;font:15px/1.6 system-ui";
  let index = 0;
  const resource = document.createElement("select");
  resource.setAttribute("aria-label", "Mine resource");
  resource.innerHTML = '<option value="TITANIUM">Titanium</option><option value="GEMS">Crystal</option>';
  resource.style.cssText = select.style.cssText;
  const rebuild = (): void => {
    const kind = kinds[index]; if (!kind) return;
    select.value = kind;
    model?.dispose(); model = createStructureReviewModel(stage.scene, kind, environment.texture, true, resource.value === "GEMS" ? "GEMS" : "TITANIUM");
    resource.hidden = kind !== "MINE";
    const center = model.bounds.getCenter(new Vector3()), size = model.bounds.getSize(new Vector3());
    const radius = Math.max(size.x, size.y, size.z, 0.5);
    controls.target.copy(center); stage.camera.position.copy(center).add(new Vector3(1.2, 1, 1.6).multiplyScalar(radius * 2));
    if (stage.camera instanceof OrthographicCamera) {
      const half = radius * 0.85, aspect = 1040 / 440;
      Object.assign(stage.camera, { left: -half * aspect, right: half * aspect, top: half, bottom: -half, zoom: 1 });
      stage.camera.updateProjectionMatrix();
    }
    controls.update();
    details.replaceChildren();
    const title = document.createElement("h2"); title.textContent = structureDisplayName(kind); title.style.cssText = "margin:0 0 8px;color:#e9d4a5";
    const role = document.createElement("p"); role.textContent = structureModelBriefFor(kind).role;
    const landmark = document.createElement("p"); landmark.textContent = `Visual brief: ${structureModelBriefFor(kind).landmark}`;
    details.append(title, role, landmark);
  };
  const button = (label: string, step: number): HTMLButtonElement => {
    const element = document.createElement("button"); element.textContent = label;
    element.style.cssText = "padding:10px 14px;background:#24363e;color:#f0e5cb;border:1px solid #65716b;cursor:pointer";
    element.onclick = () => { index = (index + step + kinds.length) % kinds.length; rebuild(); }; return element;
  };
  select.onchange = () => { index = kinds.findIndex(kind => kind === select.value); rebuild(); };
  resource.onchange = rebuild;
  bar.append(button("Previous", -1), select, button("Next", 1), resource, count);
  rebuild();
  let raf = 0;
  const tick = (): void => { controls.update(); model?.update(performance.now()); raf = requestAnimationFrame(tick); }; tick();
  const root = wrapWithCleanup(stage, [() => model?.dispose(), () => controls.dispose(), () => environment.dispose(), () => groundGeometry.dispose(), () => groundMaterial.dispose(), () => cancelAnimationFrame(raf)]);
  root.style.cssText = "max-width:1040px;margin:0 auto";
  root.prepend(bar); root.append(details); return root;
};
