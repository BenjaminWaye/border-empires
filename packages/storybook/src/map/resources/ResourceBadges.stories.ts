import type { Meta, StoryObj } from "@storybook/html-vite";
import { NETWORK_RESOURCES } from "@border-empires/shared";
import { resourceColor as colorFor } from "@client/client-map-display.js";
import { drawResourceCornerMarker } from "@client/client-map-render/client-map-render-resource-marker.js";
import { resourceSimpleIconUrl, resourceIconUrl, whenResourceIconReady, type ResourceIconKey } from "@client/client-resource-icons/client-resource-icons.js";

const resources = ["FARM", "FISH", "TITANIUM", "UMBRITE", "GEMS", ...NETWORK_RESOURCES] as const;
const sizes = [22, 48, 64, 96];


function gallery(entries: readonly (typeof resources)[number][] = resources): HTMLElement {
  const root = document.createElement("main");
  root.style.cssText = "background:#171d22;color:#e8dfca;padding:24px;font:13px/1.5 system-ui;min-height:100vh;box-sizing:border-box";
  root.innerHTML = '<h2 style="margin:0 0 4px">Resource badges · actual map sizes</h2><p style="margin:0 0 20px;color:#b2ada0">Shared by 2D canvas and true-3D. Five-colour artwork · circular badges · coloured dots below 48px tiles.</p>';
  const grid = document.createElement("div");
  grid.style.cssText = "display:grid;grid-template-columns:170px 130px repeat(4,115px);align-items:center;gap:12px 16px";
  for (const title of ["Resource", "16 / 24 / 40px icons", ...sizes.map(size => `${size}px tile`)]) {
    const label = document.createElement("strong");
    label.textContent = title;
    grid.append(label);
  }
  for (const resource of entries) {
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
        ctx.fillStyle = resource === "FISH" ? "#355e78" : resource === "CATALYTIC_DEPOSIT" ? "#9b8655" : "#455b3b";
        ctx.fillRect(4, 4, size, size);
        ctx.strokeStyle = "#ffffff18";
        ctx.strokeRect(4.5, 4.5, size - 1, size - 1);
        drawResourceCornerMarker(ctx, { x: 0, y: 0, terrain: resource === "FISH" ? "SEA" : "LAND", resource }, 4, 4, size, colorFor);
      };
      paint();
      // Repaint when the exact production cache entry decodes.
      whenResourceIconReady(key, paint);
      grid.append(canvas);
    }
  }
  root.append(grid);
  return root;
}

const meta: Meta = { title: "Map/Resources/Resource Badges", render: () => gallery() };
export default meta;
export const MapSizes: StoryObj = {};

export const PaintedResources: StoryObj = { render: () => gallery(NETWORK_RESOURCES) };

export const CoreResources: StoryObj = {
  render: () => {
    const root = gallery(["FARM", "FISH", "TITANIUM", "UMBRITE"]);
    const summary = document.createElement("section");
    summary.style.cssText = "margin:0 0 24px";
    summary.innerHTML = '<h2 style="margin:0 0 4px">Core resource icons</h2><p style="margin:0 0 12px;color:#b2ada0">One FOOD supply in the HUD. Grain and fish identify its two map sources.</p>';
    const cards = document.createElement("div");
    cards.style.cssText = "display:flex;gap:36px;align-items:end";
    const keys: readonly ResourceIconKey[] = ["GOLD", "FOOD", "FISH", "TITANIUM", "UMBRITE"];
    for (const key of keys) {
      const card = document.createElement("div");
      card.style.cssText = "display:grid;justify-items:center;gap:4px;min-width:96px";
      const icon = document.createElement("img");
      icon.src = resourceIconUrl(key, 256);
      icon.width = 64; icon.height = 64; icon.alt = key;
      const label = document.createElement("span");
      label.textContent = key === "GOLD" ? "Coin" : key === "FOOD" ? "Food / farms" : key === "FISH" ? "Fish → FOOD" : key.toLowerCase();
      card.append(icon, label); cards.append(card);
    }
    summary.append(cards); root.prepend(summary);
    return root;
  }
};
