import { structureDisplayName } from "@border-empires/shared";
import { DISTRICT_BUILDING_KINDS } from "@client/client-town-district/district-catalog.js";
import { districtArtUrl } from "@client/client-town-district/district-art.js";

/** Actual exported models, at readable and gameplay scales, with labels that
 * stay outside the art. Silhouette mode deliberately removes material cues. */
export const renderDistrictIdentityReview = (): HTMLElement => {
  const root = document.createElement("section");
  root.className = "district-identity-review";
  const style = document.createElement("style");
  style.textContent = `
    .district-identity-review { padding:32px; background:#101a20; color:#e5e9e5; font:14px/1.5 system-ui; min-height:100vh; box-sizing:border-box; }
    .district-identity-review h1 { margin:0; font:500 28px/1.2 Georgia,serif; color:#e8d4a7; }
    .district-identity-review p { color:#9daeb4; max-width:760px; }
    .district-identity-controls { display:flex; flex-wrap:wrap; gap:12px; margin:24px 0; }
    .district-identity-controls button { padding:9px 16px; background:#22333d; color:#e5e9e5; border:1px solid #42555e; border-radius:4px; cursor:pointer; }
    .district-identity-controls button[aria-pressed=true] { border-color:#d8b878; color:#f0d59f; }
    .district-identity-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(176px,1fr)); gap:1px; background:#34434a; border:1px solid #34434a; }
    .district-identity-card { margin:0; background:#18252d; padding:16px 12px 20px; text-align:center; }
    .district-identity-art { height:144px; display:grid; place-items:center; background:radial-gradient(ellipse,#33433e,transparent 70%); }
    .district-identity-art img { width:144px; height:144px; object-fit:contain; }
    .district-identity-card figcaption { margin-top:12px; font-size:12px; color:#d5dcd9; }
    .district-identity-review[data-small=true] img { width:64px; height:64px; }
    .district-identity-review[data-silhouette=true] .district-identity-art { background:#c6cbc8; }
    .district-identity-review[data-silhouette=true] img { filter:brightness(0); }
  `;
  const heading = document.createElement("h1");
  heading.textContent = "Imperial support infrastructure";
  const intro = document.createElement("p");
  intro.textContent = "45 distinct structures. Advanced machinery within the towns’ stone, ceramic and metal architecture. Compare silhouettes and 64px gameplay artwork without relying on labels or colour.";
  const controls = document.createElement("div");
  controls.className = "district-identity-controls";
  for (const [name, key] of [["Monochrome silhouettes", "silhouette"], ["64px gameplay scale", "small"]] as const) {
    const button = document.createElement("button");
    button.textContent = name;
    button.setAttribute("aria-pressed", "false");
    button.onclick = () => {
      const enabled = root.dataset[key] !== "true";
      root.dataset[key] = String(enabled);
      button.setAttribute("aria-pressed", String(enabled));
    };
    controls.appendChild(button);
  }
  const grid = document.createElement("div");
  grid.className = "district-identity-grid";
  for (const kind of DISTRICT_BUILDING_KINDS) {
    const card = document.createElement("figure");
    card.className = "district-identity-card";
    const art = document.createElement("div");
    art.className = "district-identity-art";
    const image = document.createElement("img");
    image.src = districtArtUrl(kind) ?? "";
    image.alt = structureDisplayName(kind);
    image.width = 144; image.height = 144;
    const label = document.createElement("figcaption");
    label.textContent = structureDisplayName(kind);
    art.appendChild(image); card.append(art, label); grid.appendChild(card);
  }
  root.append(style, heading, intro, controls, grid);
  return root;
};
