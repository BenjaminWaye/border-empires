import { DirectionalLight, Mesh, MeshStandardMaterial, PlaneGeometry, PMREMGenerator } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { NETWORK_RESOURCES, RESOURCE_NETWORKS, type NetworkResource } from "@border-empires/shared";
import { createNetworkOverlay } from "@client/client-resource-networks/network-models.js";
import { createStage, wrapWithCleanup } from "../../fixtures/three-stage.js";

/** Production raw-site geometry, at inspection scale with free orbit. */
export const renderResourceDepositReview = (): HTMLElement => {
  const stage = createStage({ width: 1040, height: 520, camera: "orthographic", orthoHalfHeight: 0.43, background: "#18232b" });
  stage.camera.position.set(0.85, 0.7, 1.1); stage.camera.lookAt(0, 0.16, 0);
  stage.renderer.shadowMap.enabled = true;
  const sun = stage.scene.children.find((child): child is DirectionalLight => child instanceof DirectionalLight);
  if (sun) {
    sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -1, right: 1, top: 1, bottom: -1, near: 0.1, far: 40 });
    sun.shadow.normalBias = 0.002;
  }
  const room = new RoomEnvironment(), pmrem = new PMREMGenerator(stage.renderer);
  const environment = pmrem.fromScene(room); room.dispose(); pmrem.dispose();
  const groundGeometry = new PlaneGeometry(200, 200).rotateX(-Math.PI / 2);
  const groundMaterial = new MeshStandardMaterial({ color: "#354837", roughness: 0.94 });
  const ground = new Mesh(groundGeometry, groundMaterial); ground.receiveShadow = true; ground.position.y = -0.01;
  stage.scene.add(ground);
  const raw = createNetworkOverlay(stage.scene, 1, false, environment.texture);
  const developed = createNetworkOverlay(stage.scene, 1, true, environment.texture);
  const controls = new OrbitControls(stage.camera, stage.canvas);
  controls.target.set(0, 0.16, 0); controls.enableDamping = true; controls.enablePan = false;
  controls.minZoom = 0.5; controls.maxZoom = 3; controls.maxPolarAngle = Math.PI * 0.47; controls.update();
  let resource: NetworkResource = "PRECURSOR_SALVAGE";
  const bar = document.createElement("div");
  bar.style.cssText = "display:flex;gap:18px;align-items:center;padding:16px;background:#18232b;color:#e7dcc7;font:14px system-ui";
  const select = document.createElement("select"); select.setAttribute("aria-label", "Resource deposit");
  select.style.cssText = "padding:10px;background:#24363e;color:#f0e5cb;border:1px solid #65716b;font:inherit";
  for (const kind of NETWORK_RESOURCES) {
    const option = document.createElement("option"); option.value = kind; option.textContent = RESOURCE_NETWORKS[kind].name;
    select.appendChild(option);
  }
  select.value = resource;
  const label = document.createElement("label"), checkbox = document.createElement("input");
  checkbox.type = "checkbox"; label.append(checkbox, " Developed installation");
  const hint = document.createElement("span"); hint.textContent = "Drag to orbit · scroll to zoom";
  const details = document.createElement("div"); details.style.cssText = "padding:20px;background:#18232b;color:#d9dfd7;font:15px/1.6 system-ui";
  const rebuild = (): void => {
    raw.clear(); developed.clear();
    (checkbox.checked ? developed : raw).add({ x: 0, y: 0, z: 0, kind: resource, operational: true, foundation: false });
    raw.commit(); developed.commit();
    const spec = RESOURCE_NETWORKS[resource];
    const heading = document.createElement("h2"); heading.textContent = checkbox.checked ? spec.buildingName : spec.name;
    heading.style.cssText = "margin:0 0 8px;color:#e9d4a5";
    const description = document.createElement("p"); description.textContent = spec.description;
    const effect = document.createElement("p"); effect.textContent = spec.effect;
    details.replaceChildren(heading, description, effect);
  };
  select.onchange = () => { const selected = NETWORK_RESOURCES.find(kind => kind === select.value); if (selected) resource = selected; rebuild(); };
  checkbox.onchange = rebuild; bar.append(select, label, hint); rebuild();
  let raf = 0;
  const tick = (): void => { controls.update(); raf = requestAnimationFrame(tick); }; tick();
  const root = wrapWithCleanup(stage, [raw.dispose, developed.dispose, () => controls.dispose(), () => environment.dispose(),
    () => groundGeometry.dispose(), () => groundMaterial.dispose(), () => cancelAnimationFrame(raf)]);
  root.style.cssText = "max-width:1040px;margin:auto"; root.prepend(bar); root.append(details); return root;
};
