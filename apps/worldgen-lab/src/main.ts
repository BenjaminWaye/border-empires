import { WORLD_WIDTH } from "@border-empires/shared";
import { Pane } from "tweakpane";
import { renderWorld, WONDER_COLORS, type Layers, type ViewConfig } from "./renderer.js";
import type { MapStyle, WorkerRequest, WorkerResponse } from "./worker.js";
import { STAGE_LABELS, STAGE_ORDER, type ProgressMessage, type StageKey, type StageTiming } from "./worker-progress.js";

const canvas = document.getElementById("world-canvas") as HTMLCanvasElement;
const statusText = document.getElementById("status-text")!;
const wonderList = document.getElementById("wonder-list")!;
const progressTrack = document.getElementById("progress-track")!;
const progressFill = document.getElementById("progress-fill")!;
const timingList = document.getElementById("timing-list")!;

// Progress bar width is driven by real measured stage durations from the
// previous run (per map style), not a guess — so it tracks actual cost.
// Falls back to equal per-stage weights until a run has completed once.
const timingHistoryKey = (mapStyle: MapStyle): string => `worldgen-lab-stage-timings-${mapStyle}`;

const loadStageWeights = (mapStyle: MapStyle): Partial<Record<StageKey, number>> => {
  try {
    const raw = localStorage.getItem(timingHistoryKey(mapStyle));
    if (!raw) return {};
    const timings = JSON.parse(raw) as StageTiming[];
    const total = timings.reduce((sum, t) => sum + t.ms, 0);
    if (total <= 0) return {};
    const weights: Partial<Record<StageKey, number>> = {};
    for (const t of timings) weights[t.stage] = t.ms / total;
    return weights;
  } catch {
    return {};
  }
};

const saveStageTimings = (mapStyle: MapStyle, timings: StageTiming[]): void => {
  try {
    localStorage.setItem(timingHistoryKey(mapStyle), JSON.stringify(timings));
  } catch {
    // localStorage unavailable (private mode, quota) — progress bar just falls back to equal weights
  }
};

const setProgressFraction = (fraction: number): void => {
  progressFill.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
};

const renderTimingBreakdown = (timings: StageTiming[]): void => {
  timingList.replaceChildren();
  const sorted = [...timings].sort((a, b) => b.ms - a.ms);
  const slowest = sorted[0]?.stage;
  for (const t of sorted) {
    const row = document.createElement("p");
    if (t.stage === slowest) row.className = "slowest";
    row.append(STAGE_LABELS[t.stage], `${t.ms.toFixed(0)} ms`);
    timingList.appendChild(row);
  }
};

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
  shade: true,
  hills: false,
  resources: false,
  towns: false,
  docks: false,
  wonders: true,
  spawnSites: true,
  rivers: true
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
  wonders: "—",
  hills: "—",
  farm: "—",
  fish: "—",
  gems: "—",
  titanium: "—",
  umbrite: "—",
  spawnSites: "—"
};

let lastData: WorkerResponse | null = null;

// --- Generate ---
let stageWeights: Partial<Record<StageKey, number>> = {};
const equalWeight = 1 / STAGE_ORDER.length;

const generate = (): void => {
  if (busy) return;
  busy = true;
  stageWeights = loadStageWeights(params.mapStyle);
  progressTrack.classList.remove("done");
  setProgressFraction(0);
  statusText.textContent = "Generating…";
  worker.postMessage({ seed: params.seed, mapStyle: params.mapStyle } satisfies WorkerRequest);
};

// Cumulative weight of every stage before `stage` in STAGE_ORDER, so the bar
// jumps forward by that stage's real (or, on a first run, equal) share.
const weightBefore = (stage: StageKey): number => {
  let sum = 0;
  for (const s of STAGE_ORDER) {
    if (s === stage) break;
    sum += stageWeights[s] ?? equalWeight;
  }
  return sum;
};

const handleProgress = (message: ProgressMessage): void => {
  const base = weightBefore(message.stage);
  const stageWeight = stageWeights[message.stage] ?? equalWeight;
  // Terrain is the one stage with real sub-progress (seed refinement attempts).
  const withinStage = message.totalAttempts ? ((message.attempt ?? 1) - 1) / message.totalAttempts : 0;
  setProgressFraction(base + stageWeight * withinStage);

  statusText.textContent = message.totalAttempts
    ? `${STAGE_LABELS[message.stage]} — attempt ${message.attempt}/${message.totalAttempts}…`
    : `${STAGE_LABELS[message.stage]}…`;
};

const redraw = (): void => {
  if (lastData) renderWorld(canvas, lastData, layers, view);
};

const renderWonderList = (wonders: WorkerResponse["wonders"]): void => {
  wonderList.replaceChildren();
  for (const wonder of [...wonders].sort((a, b) => a.type.localeCompare(b.type))) {
    const x = wonder.index % WORLD_WIDTH;
    const y = Math.floor(wonder.index / WORLD_WIDTH);
    const [r, g, b] = WONDER_COLORS[wonder.type] ?? [255, 255, 255];

    const row = document.createElement("p");
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = `rgb(${r}, ${g}, ${b})`;
    row.appendChild(swatch);
    row.appendChild(document.createTextNode(`${wonder.type} — (${x}, ${y})`));
    wonderList.appendChild(row);
  }
  if (wonders.length < 9) {
    const missing = document.createElement("p");
    missing.style.color = "#a55";
    missing.textContent = `${9 - wonders.length} type(s) failed to place (no valid tile found in 5000 attempts)`;
    wonderList.appendChild(missing);
  }
};

worker.onmessage = (event: MessageEvent<WorkerResponse | ProgressMessage>): void => {
  if (event.data.kind === "progress") {
    handleProgress(event.data);
    return;
  }

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
  stats.hills = `${d.hillsCount.toLocaleString()} tiles (${d.landCount > 0 ? Math.round((d.hillsCount / d.landCount) * 100) : 0}% of land)`;
  stats.farm = `${d.farmSites.toLocaleString()} tiles`;
  stats.fish = `${d.fishSites.toLocaleString()} tiles`;
  stats.gems = `${d.gemsSites.toLocaleString()} tiles`;
  stats.titanium = `${d.titaniumSites.toLocaleString()} tiles`;
  stats.umbrite = `${d.umbriteSites.toLocaleString()} tiles`;
  stats.wonders = `${d.wonders.length} / 9 placed`;
  stats.spawnSites =
    d.spawnSiteIndices.length >= d.spawnSiteTarget
      ? `${d.spawnSiteIndices.length} / ${d.spawnSiteTarget} (full roster)`
      : `${d.spawnSiteIndices.length} / ${d.spawnSiteTarget} (map couldn't secure a full roster)`;
  renderWonderList(d.wonders);
  renderTimingBreakdown(d.stageTimings);
  saveStageTimings(params.mapStyle, d.stageTimings);
  progressTrack.classList.add("done");
  setProgressFraction(1);

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
layerFolder.addBinding(layers, "hills", { label: "Hills" }).on("change", redraw);
layerFolder.addBinding(layers, "resources", { label: "Resources" }).on("change", redraw);
layerFolder.addBinding(layers, "towns", { label: "Towns" }).on("change", redraw);
layerFolder.addBinding(layers, "docks", { label: "Docks" }).on("change", redraw);
layerFolder.addBinding(layers, "wonders", { label: "Natural Wonders" }).on("change", redraw);
layerFolder.addBinding(layers, "spawnSites", { label: "Fair spawn sites" }).on("change", redraw);
layerFolder.addBinding(layers, "rivers", { label: "Rivers" }).on("change", redraw);

// Stats
const statsFolder = pane.addFolder({ title: "Stats", expanded: true });
statsFolder.addBinding(stats, "land", { label: "Land", readonly: true });
statsFolder.addBinding(stats, "hills", { label: "Hills", readonly: true });
statsFolder.addBinding(stats, "islands", { label: "Islands", readonly: true });
statsFolder.addBinding(stats, "largestIsland", { label: "Largest", readonly: true });
statsFolder.addBinding(stats, "attempts", { label: "Attempts", readonly: true });
statsFolder.addBinding(stats, "time", { label: "Gen time", readonly: true });

// Settlements
const settlementFolder = pane.addFolder({ title: "Settlements", expanded: true });
settlementFolder.addBinding(stats, "towns", { label: "Towns", readonly: true });
settlementFolder.addBinding(stats, "docks", { label: "Docks", readonly: true });
settlementFolder.addBinding(stats, "wonders", { label: "Wonders", readonly: true });
settlementFolder.addBinding(stats, "spawnSites", { label: "Fair spawn sites", readonly: true });

// Resources (placed cluster tile counts)
const resourceFolder = pane.addFolder({ title: "Resources", expanded: true });
resourceFolder.addBinding(stats, "farm", { label: "Farm", readonly: true });
resourceFolder.addBinding(stats, "fish", { label: "Fish", readonly: true });
resourceFolder.addBinding(stats, "gems", { label: "Gems", readonly: true });
resourceFolder.addBinding(stats, "titanium", { label: "Titanium", readonly: true });
resourceFolder.addBinding(stats, "umbrite", { label: "Umbrite", readonly: true });

// Auto-generate on load
generate();
