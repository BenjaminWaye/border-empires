import { Pane } from "tweakpane";
import { renderWorld, type Layers } from "./renderer.js";
import type { WorkerRequest, WorkerResponse } from "./worker.js";

const canvas = document.getElementById("world-canvas") as HTMLCanvasElement;
const statusText = document.getElementById("status-text")!;

// Start at a reasonable size; renderer will resize on each draw
canvas.width = 900;
canvas.height = 900;

// --- Worker ---
const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
let busy = false;

// --- State ---
const params = {
  seed: 12345,
  autoGenerate: false
};

const layers: Layers = {
  biome: true,
  region: false,
  shade: true
};

const stats = {
  land: 0,
  sea: 0,
  mountain: 0,
  time: "—"
};

let lastData: WorkerResponse | null = null;

// --- Generate ---
const generate = (): void => {
  if (busy) return;
  busy = true;
  statusText.textContent = `Generating seed ${params.seed}…`;
  worker.postMessage({ seed: params.seed } satisfies WorkerRequest);
};

worker.onmessage = (event: MessageEvent<WorkerResponse>): void => {
  busy = false;
  lastData = event.data;

  stats.land = event.data.landCount;
  stats.sea = event.data.seaCount;
  stats.mountain = event.data.mountainCount;
  stats.time = `${event.data.durationMs.toFixed(0)} ms`;

  statusText.textContent = `Seed ${event.data.seed} — ${event.data.durationMs.toFixed(0)} ms`;

  renderWorld(canvas, lastData, layers);
  pane.refresh();
};

worker.onerror = (err): void => {
  busy = false;
  statusText.textContent = `Error: ${err.message}`;
};

// --- Tweakpane ---
const pane = new Pane({ container: document.getElementById("pane") as HTMLElement, title: "Controls" });

// Seed controls
const seedFolder = pane.addFolder({ title: "Seed" });
seedFolder.addBinding(params, "seed", { label: "Seed", step: 1, min: 0, max: 2_000_000_000 });

seedFolder.addButton({ title: "Randomize" }).on("click", () => {
  params.seed = Math.floor(Math.random() * 1_000_000_000);
  pane.refresh();
  if (params.autoGenerate) generate();
});

seedFolder.addButton({ title: "▶  Generate" }).on("click", () => {
  generate();
});

seedFolder.addBinding(params, "autoGenerate", { label: "Auto on change" });

// Watch seed changes when autoGenerate is on
seedFolder.on("change", () => {
  if (params.autoGenerate) generate();
});

// Layer toggles
const layerFolder = pane.addFolder({ title: "Layers" });

layerFolder.addBinding(layers, "biome", { label: "Biome colors" }).on("change", () => {
  if (lastData) renderWorld(canvas, lastData, layers);
});
layerFolder.addBinding(layers, "region", { label: "Region tint" }).on("change", () => {
  if (lastData) renderWorld(canvas, lastData, layers);
});
layerFolder.addBinding(layers, "shade", { label: "Grass shade" }).on("change", () => {
  if (lastData) renderWorld(canvas, lastData, layers);
});

// Stats (read-only)
const statsFolder = pane.addFolder({ title: "Stats", expanded: true });
statsFolder.addBinding(stats, "land", { label: "Land", readonly: true });
statsFolder.addBinding(stats, "sea", { label: "Sea", readonly: true });
statsFolder.addBinding(stats, "mountain", { label: "Mountain", readonly: true });
statsFolder.addBinding(stats, "time", { label: "Gen time", readonly: true });

// Auto-generate on load
generate();
