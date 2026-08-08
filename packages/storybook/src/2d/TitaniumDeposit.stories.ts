import type { Meta, StoryObj } from "@storybook/html-vite";

type Args = {
  background: "grass" | "sand" | "dark";
  size: number;
};

const titaniumOverlays = import.meta.glob("../../../client/public/overlays/titanium-overlay-*.svg", {
  eager: true,
  query: "?url",
  import: "default"
}) as Record<string, string>;

const BACKGROUNDS: Record<Args["background"], string> = {
  grass: "#4a6b3f",
  sand: "#c9b178",
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
  header.textContent = "Titanium deposit overlays (raw resource tile)";

  const grid = document.createElement("div");
  grid.style.display = "flex";
  grid.style.gap = "16px";
  grid.style.flexWrap = "wrap";

  for (const [path, url] of Object.entries(titaniumOverlays)) {
    const name = filenameFromPath(path);

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
    img.style.maxWidth = "90%";
    img.style.maxHeight = "90%";
    swatch.appendChild(img);

    const label = document.createElement("div");
    label.textContent = name;
    label.style.fontSize = "10px";
    label.style.marginTop = "6px";
    label.style.opacity = "0.8";

    cell.append(swatch, label);
    grid.appendChild(cell);
  }

  root.append(header, grid);
  return root;
};

const meta: Meta<Args> = {
  title: "2D Library/TitaniumDeposit",
  argTypes: {
    background: { control: "inline-radio", options: ["grass", "sand", "dark"] },
    size: { control: { type: "range", min: 32, max: 160, step: 8 } }
  },
  args: { background: "grass", size: 96 },
  render
};

export default meta;
type Story = StoryObj<Args>;

export const OnGrass: Story = {};
export const OnSand: Story = { args: { background: "sand" } };
export const OnDark: Story = { args: { background: "dark" } };
