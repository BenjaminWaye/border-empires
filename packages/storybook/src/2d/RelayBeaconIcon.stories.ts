import type { Meta, StoryObj } from "@storybook/html-vite";

type Args = {
  background: "grass" | "sand" | "dark";
  size: number;
};

const icons = import.meta.glob("../../../client/public/overlays/{relay-beacon,siege-outpost}-overlay.svg", {
  eager: true,
  query: "?url",
  import: "default"
}) as Record<string, string>;

const OVERLAY_URLS: Record<string, string> = {};
for (const [path, url] of Object.entries(icons)) {
  const name = path.slice(path.lastIndexOf("/") + 1).replace(/\.svg$/, "");
  OVERLAY_URLS[name] = url;
}

const beaconUrl = OVERLAY_URLS["relay-beacon-overlay"] ?? "";
const outpostUrl = OVERLAY_URLS["siege-outpost-overlay"] ?? "";

const BACKGROUNDS: Record<Args["background"], string> = {
  grass: "#3f5d3a",
  sand: "#c9b178",
  dark: "#0a0e14"
};

const createRoot = (headerText: string): HTMLElement => {
  const root = document.createElement("div");
  root.style.padding = "16px";
  root.style.background = "#0a0e14";
  root.style.color = "#cbd5e1";
  root.style.fontFamily = "system-ui, sans-serif";
  root.style.minHeight = "100vh";
  const header = document.createElement("div");
  header.style.marginBottom = "12px";
  header.style.fontSize = "13px";
  header.style.opacity = "0.7";
  header.textContent = headerText;
  root.appendChild(header);
  return root;
};

const createSwatch = (url: string, size: number, bg: string): HTMLElement => {
  const swatch = document.createElement("div");
  swatch.style.width = `${size}px`;
  swatch.style.height = `${size}px`;
  swatch.style.background = bg;
  swatch.style.display = "flex";
  swatch.style.alignItems = "center";
  swatch.style.justifyContent = "center";
  swatch.style.borderRadius = "4px";
  swatch.style.border = "1px solid rgba(255, 255, 255, 0.08)";
  const img = document.createElement("img");
  img.src = url;
  img.alt = "overlay icon";
  img.style.maxWidth = "90%";
  img.style.maxHeight = "90%";
  swatch.appendChild(img);
  return swatch;
};

const createSwatchCell = (url: string, size: number, bg: string, labelText: string): HTMLElement => {
  const cell = document.createElement("div");
  cell.style.display = "flex";
  cell.style.flexDirection = "column";
  cell.style.alignItems = "center";
  cell.style.gap = "4px";
  cell.appendChild(createSwatch(url, size, bg));
  const label = document.createElement("div");
  label.textContent = labelText;
  label.style.fontSize = "10px";
  label.style.opacity = "0.6";
  cell.appendChild(label);
  return cell;
};

const render = (args: Args): HTMLElement => {
  const root = createRoot(`Relay Beacon icon @ ${args.size}px on ${args.background}`);
  root.appendChild(createSwatch(beaconUrl, args.size, BACKGROUNDS[args.background]));
  return root;
};

const renderReadability = (): HTMLElement => {
  const root = createRoot("Relay Beacon icon readability — 32px / 64px / 128px");
  const grid = document.createElement("div");
  grid.style.display = "grid";
  grid.style.gridTemplateColumns = "repeat(4, auto)";
  grid.style.gap = "16px";
  grid.style.alignItems = "center";
  grid.style.justifyContent = "start";

  grid.appendChild(document.createElement("div"));
  for (const size of [32, 64, 128]) {
    const head = document.createElement("div");
    head.textContent = `${size}px`;
    head.style.fontSize = "11px";
    head.style.opacity = "0.6";
    head.style.textAlign = "center";
    grid.appendChild(head);
  }
  for (const bg of ["grass", "dark", "sand"] as const) {
    const label = document.createElement("div");
    label.textContent = bg;
    label.style.fontSize = "11px";
    label.style.opacity = "0.7";
    grid.appendChild(label);
    for (const size of [32, 64, 128]) {
      grid.appendChild(createSwatchCell(beaconUrl, size, BACKGROUNDS[bg], `${bg} / ${size}px`));
    }
  }

  root.appendChild(grid);
  return root;
};

const renderContrast = (): HTMLElement => {
  const root = createRoot("Relay Beacon vs Siege Outpost — must not read as a military fortification");
  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.gap = "20px";
  row.style.flexWrap = "wrap";

  const buildCell = (title: string, url: string): HTMLElement => {
    const cell = document.createElement("div");
    cell.style.display = "flex";
    cell.style.flexDirection = "column";
    cell.style.alignItems = "center";
    cell.style.gap = "12px";
    cell.style.padding = "12px";
    cell.style.background = "#11161f";
    cell.style.border = "1px solid #1f2937";
    cell.style.borderRadius = "6px";
    const label = document.createElement("div");
    label.textContent = title;
    label.style.fontSize = "12px";
    label.style.opacity = "0.85";
    cell.appendChild(label);
    for (const size of [48, 96]) {
      cell.appendChild(createSwatchCell(url, size, BACKGROUNDS.grass, `${size}px on grass`));
    }
    return cell;
  };

  row.append(buildCell("Relay Beacon", beaconUrl), buildCell("Siege Outpost", outpostUrl));
  root.appendChild(row);
  return root;
};

const meta: Meta<Args> = {
  title: "2D Library/RelayBeaconIcon",
  argTypes: {
    background: { control: "inline-radio", options: ["grass", "sand", "dark"] },
    size: { control: { type: "range", min: 32, max: 160, step: 8 } }
  },
  args: { background: "grass", size: 96 },
  render
};

export default meta;
type Story = StoryObj<Args>;

// The icon at a configurable size on a configurable terrain swatch.
export const OnGrass: Story = {};
export const OnDark: Story = { args: { background: "dark" } };
export const OnSand: Story = { args: { background: "sand" } };

// Readability check at the minimap/map sizes the icon will actually be
// rendered at: the tall lattice silhouette, brass mirror array, signal lamps
// and observation optics must all survive down to 32px.
export const Readability: Story = { render: renderReadability };

// Side-by-side against the existing light-brown Siege Outpost tile icon so
// the dark brass beacon silhouette can be told apart at a glance.
export const ContrastWithSiegeOutpost: Story = { render: renderContrast };
