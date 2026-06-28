import { Pane } from "tweakpane";
import { renderWorld, type Layers, type ViewConfig } from "./renderer.js";
import type { MapStyle, WorkerRequest, WorkerResponse } from "./worker.js";

const canvas = document.getElementById("world-canvas") as HTMLCanvasElement;
const statusText = document.getElementById("status-text")!;

canvas.width = 900;
canvas.height = 900;

// --- Worker ---
const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
let busy = false;

// --- State ---
const params = {
  seed: 12345,
  mapStyle: "continents" as MapStyle,
  autoGenerate: false
};

const layers: Layers = {
  biome: true,
  region: false,
  shade: true
};

const view: ViewConfig = {
  yOffset: 0
};

const stats = {
  land: "—",
  islands: "—",
  largestIsland: "—",
  attempts: "—",
  time: "—",
  towns: "—",
  docks: "—",
  farm: "—",
  fish: "—",
  gems: "—",
  iron: "—",
  fur: "—"
};

let lastData: WorkerResponse | null = null;

// --- Generate ---
const generate = (): void => {
  if (busy) return;
  busy = true;
  statusText.textContent = `Generating${params.mapStyle === "islands" ? " (islands, up to 16 attempts)…" : "…"}`;
  worker.postMessage({ seed: params.seed, mapStyle: params.mapStyle } satisfies WorkerRequest);
};

const redraw = (): void => {
  if (lastData) renderWorld(canvas, lastData, layers, view);
};

worker.onmessage = (event: MessageEvent<WorkerResponse>): void => {
  busy = false;
  lastData = event.data;
  const d = event.data;

  const totalTiles = d.landCount + d.seaCount + d.mountainCount;
  const landPct = totalTiles > 0 ? Math.round((d.landCount / totalTiles) * 100) : 0;

  stats.land = `${d.landCount.toLocaleString()} (${landPct}%)`;
  stats.islands = `${d.islandCount} significant`;
  stats.largestIsland = `${d.largestIslandPct}% of land`;
  stats.attempts = d.attempts === 1 ? "1 (no refinement)" : `${d.attempts}`;
  stats.time = `${d.durationMs.toFixed(0)} ms`;
  stats.towns = `${d.townCount}`;
  stats.docks = `${d.dockCount}`;
  stats.farm = `${d.farmSites.toLocaleString()} tiles`;
  stats.fish = `${d.fishSites.toLocaleString()} tiles`;
  stats.gems = `${d.gemsSites.toLocaleString()} tiles`;
  stats.iron = `${d.ironSites.toLocaleString()} tiles`;
  stats.fur = `${d.furSites.toLocaleString()} tiles`;

  const seedLabel = d.actualSeed !== d.requestedSeed
    ? `Seed ${d.actualSeed} (requested ${d.requestedSeed})`
    : `Seed ${d.actualSeed}`;
  statusText.textContent = `${seedLabel} — ${d.durationMs.toFixed(0)} ms`;

  // Sync actual seed back to the input if it was refined
  if (d.actualSeed !== d.requestedSeed) {
    params.seed = d.actualSeed;
  }

  redraw();
  pane.refresh();
};

worker.onerror = (err): void => {
  busy = false;
  statusText.textContent = `Error: ${err.message}`;
};

// --- Tweakpane ---
const pane = new Pane({ container: document.getElementById("pane") as HTMLElement, title: "Controls" });

// Map type
const typeFolder = pane.addFolder({ title: "Map Type" });
typeFolder.addBinding(params, "mapStyle", {
  label: "Style",
  options: { Continents: "continents", Islands: "islands" }
});

// Seed controls
const seedFolder = pane.addFolder({ title: "Seed" });
seedFolder.addBinding(params, "seed", { label: "Seed", step: 1, min: 0, max: 2_000_000_000 });
seedFolder.addButton({ title: "Randomize" }).on("click", () => {
  params.seed = Math.floor(Math.random() * 1_000_000_000);
  pane.refresh();
  if (params.autoGenerate) generate();
});
seedFolder.addButton({ title: "▶  Generate" }).on("click", generate);
seedFolder.addBinding(params, "autoGenerate", { label: "Auto on change" });
seedFolder.on("change", () => {
  if (params.autoGenerate) generate();
});

// View
const viewFolder = pane.addFolder({ title: "View" });
viewFolder.addBinding(view, "yOffset", {
  label: "Scroll Y",
  min: 0,
  max: 449,
  step: 1
}).on("change", redraw);
viewFolder.addButton({ title: "Reset scroll" }).on("click", () => {
  view.yOffset = 0;
  pane.refresh();
  redraw();
});

// Layer toggles
const layerFolder = pane.addFolder({ title: "Layers" });
layerFolder.addBinding(layers, "biome", { label: "Biome colors" }).on("change", redraw);
layerFolder.addBinding(layers, "region", { label: "Region tint" }).on("change", redraw);
layerFolder.addBinding(layers, "shade", { label: "Grass shade" }).on("change", redraw);

// Stats
const statsFolder = pane.addFolder({ title: "Stats", expanded: true });
statsFolder.addBinding(stats, "land", { label: "Land", readonly: true });
statsFolder.addBinding(stats, "islands", { label: "Islands", readonly: true });
statsFolder.addBinding(stats, "largestIsland", { label: "Largest", readonly: true });
statsFolder.addBinding(stats, "attempts", { label: "Attempts", readonly: true });
statsFolder.addBinding(stats, "time", { label: "Gen time", readonly: true });

// Settlements
const settlementFolder = pane.addFolder({ title: "Settlements", expanded: true });
settlementFolder.addBinding(stats, "towns", { label: "Towns", readonly: true });
settlementFolder.addBinding(stats, "docks", { label: "Docks", readonly: true });

// Resources (eligible tile counts)
const resourceFolder = pane.addFolder({ title: "Resources", expanded: true });
resourceFolder.addBinding(stats, "farm", { label: "Farm", readonly: true });
resourceFolder.addBinding(stats, "fish", { label: "Fish", readonly: true });
resourceFolder.addBinding(stats, "gems", { label: "Gems", readonly: true });
resourceFolder.addBinding(stats, "iron", { label: "Iron", readonly: true });
resourceFolder.addBinding(stats, "fur", { label: "Fur", readonly: true });

// Auto-generate on load
generate();
