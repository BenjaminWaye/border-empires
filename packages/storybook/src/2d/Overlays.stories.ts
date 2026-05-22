import type { Meta, StoryObj } from "@storybook/html";

type Args = {
  filter: string;
  background: "grass" | "sand" | "water" | "dark";
  size: number;
};

const overlays = import.meta.glob("../../../client/public/overlays/*.svg", {
  eager: true,
  query: "?url",
  import: "default"
}) as Record<string, string>;

const BACKGROUNDS: Record<Args["background"], string> = {
  grass: "#3f5d3a",
  sand: "#c9b178",
  water: "#2a4a6b",
  dark: "#0a0e14"
};

const filenameFromPath = (path: string): string => {
  const slash = path.lastIndexOf("/");
  return slash >= 0 ? path.slice(slash + 1) : path;
};

const render = (args: Args): HTMLElement => {
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

  const grid = document.createElement("div");
  grid.style.display = "grid";
  grid.style.gridTemplateColumns = `repeat(auto-fill, minmax(${args.size + 24}px, 1fr))`;
  grid.style.gap = "12px";

  const needle = args.filter.trim().toLowerCase();
  let visible = 0;

  for (const [path, url] of Object.entries(overlays)) {
    const name = filenameFromPath(path);
    if (needle && !name.toLowerCase().includes(needle)) continue;
    visible += 1;

    const cell = document.createElement("div");
    cell.style.display = "flex";
    cell.style.flexDirection = "column";
    cell.style.alignItems = "center";
    cell.style.padding = "8px";
    cell.style.background = "#11161f";
    cell.style.border = "1px solid #1f2937";
    cell.style.borderRadius = "6px";

    const swatch = document.createElement("div");
    swatch.style.width = `${args.size}px`;
    swatch.style.height = `${args.size}px`;
    swatch.style.background = BACKGROUNDS[args.background];
    swatch.style.display = "flex";
    swatch.style.alignItems = "center";
    swatch.style.justifyContent = "center";
    swatch.style.borderRadius = "4px";

    const img = document.createElement("img");
    img.src = url;
    img.alt = name;
    img.style.maxWidth = "85%";
    img.style.maxHeight = "85%";
    swatch.appendChild(img);

    const label = document.createElement("div");
    label.textContent = name.replace(/-overlay(-[a-z0-9]+)?\.svg$/, "$1").replace(/^-/, "") || name;
    label.title = name;
    label.style.fontSize = "10px";
    label.style.marginTop = "6px";
    label.style.textAlign = "center";
    label.style.wordBreak = "break-word";
    label.style.maxWidth = `${args.size + 16}px`;
    label.style.opacity = "0.8";

    cell.append(swatch, label);
    grid.appendChild(cell);
  }

  header.textContent = `${visible} / ${Object.keys(overlays).length} overlays`;
  root.append(header, grid);
  return root;
};

const meta: Meta<Args> = {
  title: "2D Library/Overlays",
  argTypes: {
    filter: { control: "text", description: "Substring filter on filename" },
    background: { control: "inline-radio", options: ["grass", "sand", "water", "dark"] },
    size: { control: { type: "range", min: 32, max: 160, step: 8 } }
  },
  args: {
    filter: "",
    background: "grass",
    size: 72
  },
  render
};

export default meta;

type Story = StoryObj<Args>;

export const Gallery: Story = {};

export const Grass: Story = { args: { background: "grass", filter: "" } };
export const Sand: Story = { args: { background: "sand", filter: "" } };
export const Water: Story = { args: { background: "water", filter: "dock" } };
export const Farms: Story = { args: { filter: "farm" } };
export const Towns: Story = { args: { filter: "town" } };
