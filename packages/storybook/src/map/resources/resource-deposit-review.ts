import { NETWORK_VARIANTS, NETWORK_VARIANT_NAMES, type NetworkVariant } from "@client/client-resource-networks/network-variants.js";
import { DirectionalLight, Mesh, MeshStandardMaterial, PlaneGeometry, PMREMGenerator } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { NETWORK_RESOURCES, RESOURCE_NETWORKS, type NetworkResource } from "@border-empires/shared";
import { createNetworkOverlay } from "@client/client-resource-networks/network-models.js";
import { createStage, wrapWithCleanup } from "../../fixtures/three-stage.js";

/** Production raw-site geometry, at inspection scale with free orbit. */
const renderResourceReview = (compare: boolean, startDeveloped = false): HTMLElement => {
  const stage = createStage({ width: 1040, height: 520, camera: "orthographic", orthoHalfHeight: compare ? 0.72 : 0.43, background: "#18232b" });
  if (compare) stage.camera.position.set(1.4, 1.1, 2.8); else stage.camera.position.set(0.85, 0.7, 1.1); stage.camera.lookAt(0, 0.16, 0);
  stage.renderer.shadowMap.enabled = true;
  const sun = stage.scene.children.find((child): child is DirectionalLight => child instanceof DirectionalLight);
  if (sun) {
    sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: compare ? -2 : -1, right: compare ? 2 : 1, top: 1, bottom: -1, near: 0.1, far: 40 });
    sun.shadow.normalBias = 0.002;
  }
  const room = new RoomEnvironment(), pmrem = new PMREMGenerator(stage.renderer);
  const environment = pmrem.fromScene(room); room.dispose(); pmrem.dispose();
  const groundGeometry = new PlaneGeometry(200, 200).rotateX(-Math.PI / 2);
  const groundMaterial = new MeshStandardMaterial({ color: "#354837", roughness: 0.94 });
  const ground = new Mesh(groundGeometry, groundMaterial); ground.receiveShadow = true; ground.position.y = -0.01;
  stage.scene.add(ground);
  const raw = createNetworkOverlay(stage.scene, compare ? 3 : 1, false, environment.texture);
  const developed = createNetworkOverlay(stage.scene, 1, true, environment.texture);
  const controls = new OrbitControls(stage.camera, stage.canvas);
  controls.target.set(0, 0.16, 0); controls.enableDamping = true; controls.enablePan = false;
  controls.minZoom = 0.5; controls.maxZoom = 3; controls.maxPolarAngle = Math.PI * 0.47; controls.update();
  let resource: NetworkResource = "PRECURSOR_SALVAGE";
  let variant: NetworkVariant = 0;
  const bar = document.createElement("div");
  bar.style.cssText = "display:flex;gap:18px;align-items:center;padding:16px;background:#18232b;color:#e7dcc7;font:14px system-ui";
  const select = document.createElement("select"); select.setAttribute("aria-label", "Resource deposit");
  select.style.cssText = "padding:10px;background:#24363e;color:#f0e5cb;border:1px solid #65716b;font:inherit";
  for (const kind of NETWORK_RESOURCES) {
    const option = document.createElement("option"); option.value = kind; option.textContent = RESOURCE_NETWORKS[kind].name;
    select.appendChild(option);
  }
  select.value = resource;
  const variantSelect = document.createElement("select"); variantSelect.setAttribute("aria-label", "Deposit variant"); variantSelect.style.cssText = select.style.cssText;
  const label = document.createElement("label"), checkbox = document.createElement("input");
  checkbox.type = "checkbox"; checkbox.checked = startDeveloped; label.append(checkbox, " Developed installation");
  const hint = document.createElement("span"); hint.textContent = "Drag to orbit · scroll to zoom";
  const details = document.createElement("div"); details.style.cssText = "padding:20px;background:#18232b;color:#d9dfd7;font:15px/1.6 system-ui";
  const rebuild = (): void => {
    raw.clear(); developed.clear();
    variantSelect.replaceChildren(...NETWORK_VARIANTS.map(index => {
      const option=document.createElement("option");option.value=String(index);option.textContent=`Variant ${index+1}: ${NETWORK_VARIANT_NAMES[resource][index]}`;return option;
    }));
    variantSelect.value=String(variant);variantSelect.disabled=checkbox.checked;
    if (compare) for (const index of NETWORK_VARIANTS) raw.add({x:(index-1)*0.85,y:0,z:0,kind:resource,variant:index,operational:true,foundation:false});
    else (checkbox.checked ? developed : raw).add({ x: 0, y: 0, z: 0, kind: resource, variant, operational: true, foundation: false });
    raw.commit(); developed.commit();
    const spec = RESOURCE_NETWORKS[resource];
    const heading = document.createElement("h2"); heading.textContent = compare ? `${spec.name} — three variants` : checkbox.checked ? spec.buildingName : `${spec.name} — ${NETWORK_VARIANT_NAMES[resource][variant]}`;
    heading.style.cssText = "margin:0 0 8px;color:#e9d4a5";
    const description = document.createElement("p"); description.textContent = checkbox.checked && resource === "PRECURSOR_SALVAGE"
      ? "A bridge crane lifts ancient armour from a clamped wreck. Crews dismantle its machinery, sort recovered components on the roller bed, and prepare them in the adjoining workshop."
      : spec.description;
    const effect = document.createElement("p"); effect.textContent = spec.effect;
    const names=document.createElement("div");names.style.cssText="display:grid;grid-template-columns:repeat(3,1fr);text-align:center;margin-bottom:16px;color:#e9d4a5";
    for(const index of NETWORK_VARIANTS){const name=document.createElement("span");name.textContent=NETWORK_VARIANT_NAMES[resource][index];names.append(name);}
    details.replaceChildren(...(compare?[names]:[]),heading,description,effect);
  };
  select.onchange = () => { const selected = NETWORK_RESOURCES.find(kind => kind === select.value); if (selected) resource = selected; rebuild(); };
  variantSelect.onchange = () => { variant=NETWORK_VARIANTS.find(index=>String(index)===variantSelect.value) ?? 0; rebuild(); };
  checkbox.onchange = rebuild; bar.append(select,...(compare?[]:[variantSelect,label]),hint); rebuild();
  let raf = 0;
  const tick = (): void => { controls.update(); raf = requestAnimationFrame(tick); }; tick();
  const root = wrapWithCleanup(stage, [raw.dispose, developed.dispose, () => controls.dispose(), () => environment.dispose(),
    () => groundGeometry.dispose(), () => groundMaterial.dispose(), () => cancelAnimationFrame(raf)]);
  root.style.cssText = "max-width:1040px;margin:auto"; root.prepend(bar); root.append(details); return root;
};

export const renderResourceDepositReview = (): HTMLElement => renderResourceReview(false);
export const renderResourceVariantsReview = (): HTMLElement => renderResourceReview(true);

export const renderReclamationWorksReview = (): HTMLElement => renderResourceReview(false, true);
