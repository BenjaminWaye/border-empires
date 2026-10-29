import type { Meta, StoryObj } from "@storybook/html-vite";
import { NETWORK_RESOURCES, RESOURCE_NETWORKS } from "@border-empires/shared";
import { drawResourceCornerMarker } from "@client/client-map-render/client-map-render-resource-marker.js";
import { resourceSimpleIconUrl, type ResourceIconKey } from "@client/client-resource-icons/client-resource-icons.js";

const resources = ["FARM", "TITANIUM", "GEMS", ...NETWORK_RESOURCES] as const;
const sizes = [22, 48, 64, 96];
const colorFor = (resource: string | undefined): string => {
  if (resource && resource in RESOURCE_NETWORKS) return RESOURCE_NETWORKS[resource as keyof typeof RESOURCE_NETWORKS].color;
  return resource === "FARM" ? "#a4c55c" : resource === "TITANIUM" ? "#bac7d1" : "#55d5e9";
};

function gallery(): HTMLElement {
  const root = document.createElement("main");
  root.style.cssText = "background:#171d22;color:#e8dfca;padding:24px;font:13px/1.5 system-ui;min-height:100vh;box-sizing:border-box";
  root.innerHTML = '<h2 style="margin:0 0 4px">Resource badges · actual map sizes</h2><p style="margin:0 0 20px;color:#b2ada0">Shared by 2D canvas and true-3D. Below 48px tiles the map uses a colour marker.</p>';
  const grid = document.createElement("div");
  grid.style.cssText = "display:grid;grid-template-columns:170px 130px repeat(4,115px);align-items:center;gap:12px 16px";
  for (const title of ["Resource", "16 / 24 / 40px icons", ...sizes.map(size => `${size}px tile`)]) {
    const label = document.createElement("strong");
    label.textContent = title;
    grid.append(label);
  }
  for (const resource of resources) {
    const name = document.createElement("span");
    name.textContent = resource.replaceAll("_", " ").toLowerCase();
    grid.append(name);
    const key: ResourceIconKey = resource === "FARM" ? "FOOD" : resource === "GEMS" ? "CRYSTAL" : resource;
    const icons = document.createElement("div");
    icons.style.cssText = "display:flex;align-items:center;gap:12px";
    for (const size of [16, 24, 40]) {
      const icon = document.createElement("img");
      icon.src = resourceSimpleIconUrl(key);
      icon.alt = resource;
      icon.width = size;
      icon.height = size;
      icons.append(icon);
    }
    grid.append(icons);
    for (const size of sizes) {
      const canvas = document.createElement("canvas");
      const extent = size + 8;
      canvas.width = extent * 2;
      canvas.height = extent * 2;
      canvas.style.cssText = `width:${extent}px;height:${extent}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.scale(2, 2);
      const paint = (): void => {
        ctx.clearRect(0, 0, extent, extent);
        ctx.fillStyle = resource === "CATALYTIC_DEPOSIT" ? "#9b8655" : "#455b3b";
        ctx.fillRect(4, 4, size, size);
        ctx.strokeStyle = "#ffffff18";
        ctx.strokeRect(4.5, 4.5, size - 1, size - 1);
        drawResourceCornerMarker(ctx, { x: 0, y: 0, terrain: "LAND", resource }, 4, 4, size, colorFor);
      };
      paint();
      // Redraw after SVG decoding, as the production map's render loop does.
      const image = new Image();
      image.onload = paint;
      image.src = resourceSimpleIconUrl(key);
      grid.append(canvas);
    }
  }
  root.append(grid);
  return root;
}

const meta: Meta = { title: "Map/Resources/Resource Badges", render: gallery };
export default meta;
export const MapSizes: StoryObj = {};
