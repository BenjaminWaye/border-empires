import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const outputDir = resolve(process.cwd(), "packages/client/public/overlays");

const families = {
  FORT: {
    prefix: "fort-ring-overlay",
    style: "stone",
    outer: "#6e6a62",
    inner: "#bdb5a7",
    shadow: "#403a33",
    accent: "#e7ddc8",
    trim: "#b89b67",
    metal: "#786f62",
    rivet: "#d2c3a6"
  },
  SIEGE_OUTPOST: {
    prefix: "siege-outpost-ring-overlay",
    style: "siege",
    outer: "#5c3f27",
    inner: "#a27544",
    shadow: "#2e1c10",
    accent: "#d5af79",
    trim: "#bb6345",
    metal: "#6f6558",
    rivet: "#ead4a5"
  },
  WOODEN_FORT: {
    prefix: "wooden-fort-ring-overlay",
    style: "wood",
    outer: "#694622",
    inner: "#a77543",
    shadow: "#341f0d",
    accent: "#d6ad74",
    trim: "#ebd79d",
    metal: "#694622",
    rivet: "#ebdcb5"
  },
  LIGHT_OUTPOST: {
    prefix: "light-outpost-ring-overlay",
    style: "light",
    outer: "#7f6540",
    inner: "#c69d65",
    shadow: "#3b2915",
    accent: "#f0d8a6",
    trim: "#8e7045",
    metal: "#78634b",
    rivet: "#f2e0b6"
  }
};

const openings = {
  CLOSED: "closed",
  NORTH: "open-north",
  EAST: "open-east",
  SOUTH: "open-south",
  WEST: "open-west"
};

const wallShapes = {
  NORTH: {
    wall: "M 15 7 L 49 7 L 45 13 L 19 13 Z",
    face: "M 17 8 L 47 8 L 43.5 11.7 L 20.5 11.7 Z",
    trim: "M 19 12.2 L 45 12.2 L 43.7 13 L 20.3 13 Z"
  },
  SOUTH: {
    wall: "M 11 49 L 53 49 L 49 57 L 15 57 Z",
    face: "M 14 50.3 L 50 50.3 L 47.2 54.4 L 16.8 54.4 Z",
    trim: "M 15.5 55.2 L 48.5 55.2 L 47.4 57 L 16.6 57 Z"
  },
  WEST: {
    wall: "M 5 15 L 13 11 L 13 51 L 5 47 Z",
    face: "M 7.2 16.1 L 11.2 14.1 L 11.2 47.9 L 7.2 45.9 Z",
    trim: "M 5.9 45.7 L 11.9 48.6 L 11.9 50.9 L 5.9 47.8 Z"
  },
  EAST: {
    wall: "M 51 11 L 59 15 L 59 47 L 51 51 Z",
    face: "M 52.8 14.1 L 56.8 16.1 L 56.8 45.9 L 52.8 47.9 Z",
    trim: "M 52.1 48.6 L 58.1 45.7 L 58.1 47.8 L 52.1 50.9 Z"
  }
};

const wallOrder = ["NORTH", "WEST", "EAST", "SOUTH"];

const towerShapes = {
  NW: {
    body: "M 4.5 8.5 L 14 4.5 L 14 16 L 4.5 20 Z",
    face: "M 6.8 9.9 L 11.7 7.8 L 11.7 15.2 L 6.8 17.2 Z",
    cap: "M 5.9 9.1 L 12.6 6.2 L 12.6 8 L 5.9 10.7 Z"
  },
  NE: {
    body: "M 50 4.5 L 59.5 8.5 L 59.5 20 L 50 16 Z",
    face: "M 52.3 7.8 L 57.2 9.9 L 57.2 17.2 L 52.3 15.2 Z",
    cap: "M 51.4 6.2 L 58.1 9.1 L 58.1 10.7 L 51.4 8 Z"
  },
  SW: {
    body: "M 4.5 43.5 L 14 47.5 L 14 59 L 4.5 55 Z",
    face: "M 6.8 46.3 L 11.7 48.4 L 11.7 55.7 L 6.8 53.7 Z",
    cap: "M 5.9 52.2 L 12.6 55.1 L 12.6 56.9 L 5.9 54.2 Z"
  },
  SE: {
    body: "M 50 47.5 L 59.5 43.5 L 59.5 55 L 50 59 Z",
    face: "M 52.3 48.4 L 57.2 46.3 L 57.2 53.7 L 52.3 55.7 Z",
    cap: "M 51.4 55.1 L 58.1 52.2 L 58.1 54.2 L 51.4 56.9 Z"
  }
};

const cardinalForTower = {
  NW: ["NORTH", "WEST"],
  NE: ["NORTH", "EAST"],
  SW: ["SOUTH", "WEST"],
  SE: ["SOUTH", "EAST"]
};

const path = (d, fill, stroke, extra = "") =>
  `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="1.1" ${extra}/>`;

const stoneBlockDetails = (direction, colors) => {
  if (direction === "NORTH") {
    return `
      <path d="M 22 7.2 L 20.6 12.8" stroke="${colors.shadow}" stroke-width="0.9" opacity="0.45" />
      <path d="M 31.5 7.2 L 30.5 12.8" stroke="${colors.shadow}" stroke-width="0.9" opacity="0.45" />
      <path d="M 41 7.2 L 40.2 12.8" stroke="${colors.shadow}" stroke-width="0.9" opacity="0.45" />
      <path d="M 18.5 10.3 L 44.8 10.3" stroke="${colors.shadow}" stroke-width="0.9" opacity="0.32" />
    `;
  }
  if (direction === "SOUTH") {
    return `
      <path d="M 18.5 50.4 L 16.8 56.7" stroke="${colors.shadow}" stroke-width="0.9" opacity="0.45" />
      <path d="M 29 49.7 L 27.7 56.3" stroke="${colors.shadow}" stroke-width="0.9" opacity="0.45" />
      <path d="M 39.5 49.7 L 38.6 56.3" stroke="${colors.shadow}" stroke-width="0.9" opacity="0.45" />
      <path d="M 50 50.4 L 49.3 56.7" stroke="${colors.shadow}" stroke-width="0.9" opacity="0.45" />
      <path d="M 14 53.2 L 50 53.2" stroke="${colors.shadow}" stroke-width="0.9" opacity="0.34" />
    `;
  }
  if (direction === "WEST") {
    return `
      <path d="M 8.9 14.2 L 8.9 46.8" stroke="${colors.shadow}" stroke-width="0.9" opacity="0.38" />
      <path d="M 6.4 22.7 L 11.4 20.2" stroke="${colors.shadow}" stroke-width="0.9" opacity="0.4" />
      <path d="M 6.4 31.7 L 11.4 29.2" stroke="${colors.shadow}" stroke-width="0.9" opacity="0.4" />
      <path d="M 6.4 40.7 L 11.4 38.2" stroke="${colors.shadow}" stroke-width="0.9" opacity="0.4" />
    `;
  }
  return `
      <path d="M 55.1 14.2 L 55.1 46.8" stroke="${colors.shadow}" stroke-width="0.9" opacity="0.38" />
      <path d="M 52.6 20.2 L 57.6 22.7" stroke="${colors.shadow}" stroke-width="0.9" opacity="0.4" />
      <path d="M 52.6 29.2 L 57.6 31.7" stroke="${colors.shadow}" stroke-width="0.9" opacity="0.4" />
      <path d="M 52.6 38.2 L 57.6 40.7" stroke="${colors.shadow}" stroke-width="0.9" opacity="0.4" />
    `;
};

const ironReinforcement = (direction, colors) => {
  if (direction === "NORTH") {
    return `
      <rect x="24" y="8.6" width="4.2" height="3.2" rx="1" fill="${colors.metal}" opacity="0.95" />
      <rect x="35.8" y="8.6" width="4.2" height="3.2" rx="1" fill="${colors.metal}" opacity="0.95" />
      <circle cx="25.4" cy="10.2" r="0.55" fill="${colors.rivet}" />
      <circle cx="27" cy="10.2" r="0.55" fill="${colors.rivet}" />
      <circle cx="37.2" cy="10.2" r="0.55" fill="${colors.rivet}" />
      <circle cx="38.8" cy="10.2" r="0.55" fill="${colors.rivet}" />
    `;
  }
  if (direction === "SOUTH") {
    return `
      <rect x="21.5" y="51.7" width="5.2" height="3.6" rx="1" fill="${colors.metal}" opacity="0.95" />
      <rect x="37.3" y="51.7" width="5.2" height="3.6" rx="1" fill="${colors.metal}" opacity="0.95" />
      <circle cx="23.1" cy="53.5" r="0.6" fill="${colors.rivet}" />
      <circle cx="25.1" cy="53.5" r="0.6" fill="${colors.rivet}" />
      <circle cx="38.9" cy="53.5" r="0.6" fill="${colors.rivet}" />
      <circle cx="40.9" cy="53.5" r="0.6" fill="${colors.rivet}" />
    `;
  }
  if (direction === "WEST") {
    return `
      <rect x="7.3" y="23" width="3" height="5.5" rx="1" fill="${colors.metal}" opacity="0.95" />
      <rect x="7.3" y="36" width="3" height="5.5" rx="1" fill="${colors.metal}" opacity="0.95" />
      <circle cx="8.8" cy="24.9" r="0.55" fill="${colors.rivet}" />
      <circle cx="8.8" cy="26.9" r="0.55" fill="${colors.rivet}" />
      <circle cx="8.8" cy="37.9" r="0.55" fill="${colors.rivet}" />
      <circle cx="8.8" cy="39.9" r="0.55" fill="${colors.rivet}" />
    `;
  }
  return `
      <rect x="53.7" y="23" width="3" height="5.5" rx="1" fill="${colors.metal}" opacity="0.95" />
      <rect x="53.7" y="36" width="3" height="5.5" rx="1" fill="${colors.metal}" opacity="0.95" />
      <circle cx="55.2" cy="24.9" r="0.55" fill="${colors.rivet}" />
      <circle cx="55.2" cy="26.9" r="0.55" fill="${colors.rivet}" />
      <circle cx="55.2" cy="37.9" r="0.55" fill="${colors.rivet}" />
      <circle cx="55.2" cy="39.9" r="0.55" fill="${colors.rivet}" />
    `;
};

const palisadeDetails = (direction, colors) => {
  const segments = [];
  if (direction === "NORTH" || direction === "SOUTH") {
    const yTop = direction === "NORTH" ? 7.5 : 49.7;
    const yBottom = direction === "NORTH" ? 13 : 56.7;
    const tipY = direction === "NORTH" ? 6.2 : 48.2;
    for (let x = direction === "NORTH" ? 18 : 16; x <= (direction === "NORTH" ? 45 : 48); x += 4) {
      segments.push(`<path d="M ${x} ${yBottom} L ${x} ${yTop} L ${x + 1.4} ${tipY} L ${x + 2.8} ${yTop} L ${x + 2.8} ${yBottom}" fill="${colors.inner}" opacity="0.88" />`);
      segments.push(`<path d="M ${x + 1.4} ${yTop} L ${x + 1.4} ${yBottom}" stroke="${colors.shadow}" stroke-width="0.65" opacity="0.35" />`);
    }
  } else {
    const xLeft = direction === "WEST" ? 5.7 : 52.5;
    const xRight = direction === "WEST" ? 10.9 : 57.7;
    const tipX = direction === "WEST" ? 4.2 : 59.2;
    for (let y = 16; y <= 44; y += 4) {
      segments.push(`<path d="M ${xRight} ${y} L ${xLeft} ${y} L ${tipX} ${y + 1.3} L ${xLeft} ${y + 2.6} L ${xRight} ${y + 2.6}" fill="${colors.inner}" opacity="0.88" />`);
      segments.push(`<path d="M ${xLeft} ${y + 1.3} L ${xRight} ${y + 1.3}" stroke="${colors.shadow}" stroke-width="0.65" opacity="0.3" />`);
    }
  }
  return segments.join("");
};

const siegeDetails = (direction, colors) =>
  `${palisadeDetails(direction, colors)}${ironReinforcement(direction, colors)}`;

const wallSurfaceDetails = (style, direction, colors) => {
  if (style === "wood") return palisadeDetails(direction, colors);
  if (style === "siege") return siegeDetails(direction, colors);
  if (style === "stone" || style === "light") return `${stoneBlockDetails(direction, colors)}${ironReinforcement(direction, colors)}`;
  return "";
};

const shouldRenderWall = (direction, opening) => direction !== opening;

const shouldRenderTower = (tower, opening) => {
  if (opening === "CLOSED") return true;
  return !cardinalForTower[tower].includes(opening);
};

const renderWall = (direction, opening, colors) => {
  if (!shouldRenderWall(direction, opening)) return "";
  const shape = wallShapes[direction];
  return `
    <g>
      ${path(shape.wall, colors.outer, colors.shadow)}
      <path d="${shape.face}" fill="${colors.accent}" opacity="0.82" />
      <path d="${shape.trim}" fill="${colors.inner}" opacity="0.75" />
      ${wallSurfaceDetails(colors.style, direction, colors)}
    </g>
  `;
};

const renderTower = (tower, opening, colors) => {
  if (!shouldRenderTower(tower, opening)) return "";
  const shape = towerShapes[tower];
  const isFront = tower === "SW" || tower === "SE";
  const useMetalRear = colors.style === "stone";
  const bodyFill = useMetalRear && !isFront ? colors.metal : colors.outer;
  const faceFill = colors.style === "wood" ? colors.inner : isFront ? colors.accent : colors.inner;
  return `
    <g>
      ${path(shape.body, bodyFill, colors.shadow)}
      <path d="${shape.face}" fill="${faceFill}" opacity="0.92" />
      <path d="${shape.cap}" fill="${colors.trim}" opacity="0.9" />
    </g>
  `;
};

const crenels = (opening, colors) => {
  const tags = [];
  if (opening !== "NORTH") {
    for (let x = 18; x <= 44; x += 9) tags.push(`<rect x="${x}" y="2.2" width="4.5" height="2.2" rx="1" fill="${colors.inner}" opacity="0.95" />`);
  }
  if (opening !== "SOUTH") {
    for (let x = 17; x <= 45; x += 9) tags.push(`<rect x="${x}" y="59.8" width="5" height="2.2" rx="1" fill="${colors.inner}" opacity="0.95" />`);
  }
  if (opening !== "WEST") {
    for (let y = 18; y <= 44; y += 9) tags.push(`<rect x="1.8" y="${y}" width="2.2" height="4.5" rx="1" fill="${colors.inner}" opacity="0.95" />`);
  }
  if (opening !== "EAST") {
    for (let y = 18; y <= 44; y += 9) tags.push(`<rect x="60" y="${y}" width="2.2" height="4.5" rx="1" fill="${colors.inner}" opacity="0.95" />`);
  }
  return `<g>${tags.join("")}</g>`;
};

const banner = (opening, colors) => {
  const placements = {
    CLOSED: [31.5, 13.5, 0],
    NORTH: [31.5, 48.5, 180],
    EAST: [14.5, 31.5, -90],
    SOUTH: [31.5, 13.5, 0],
    WEST: [48.5, 31.5, 90]
  };
  const [x, y, rotate] = placements[opening];
  return `
    <g transform="translate(${x} ${y}) rotate(${rotate})">
      <rect x="-0.8" y="-4.4" width="1.6" height="8.8" rx="0.8" fill="${colors.shadow}" />
      <path d="M 0 -4 L 6 -2.2 L 2.4 0.8 L 6 4 L 0 4 Z" fill="${colors.trim}" opacity="0.95" />
      <path d="M 0 -4 L 4.3 -2.5 L 0 0 Z" fill="${colors.accent}" opacity="0.84" />
    </g>
  `;
};

const lightOutpostSvg = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <filter id="shadow" x="-24%" y="-24%" width="148%" height="148%">
      <feDropShadow dx="0" dy="1.15" stdDeviation="1.1" flood-color="#2b1d0c" flood-opacity="0.42"/>
    </filter>
  </defs>
  <g filter="url(#shadow)">
    <path d="M 24 48 L 40 48 L 37.5 56 L 26.5 56 Z" fill="#6c4a24" stroke="#341f0d" stroke-width="1.1" />
    <path d="M 28 46 L 36 46 L 35 50 L 29 50 Z" fill="#d9b47b" opacity="0.92" />
    <path d="M 27 21 L 31 21 L 30 49 L 26 49 Z" fill="#6c4a24" stroke="#341f0d" stroke-width="1" />
    <path d="M 33 21 L 37 21 L 38 49 L 34 49 Z" fill="#6c4a24" stroke="#341f0d" stroke-width="1" />
    <path d="M 21 18 L 43 18 L 39.5 28 L 24.5 28 Z" fill="#7a5428" stroke="#341f0d" stroke-width="1.1" />
    <path d="M 24 19.5 L 40 19.5 L 37.6 25.8 L 26.3 25.8 Z" fill="#d8c195" opacity="0.9" />
    <path d="M 23 16 L 32 10 L 41 16 L 38.5 19 L 25.5 19 Z" fill="#916331" stroke="#341f0d" stroke-width="1.1" />
    <path d="M 31.4 19.5 L 31.4 26.2" stroke="#341f0d" stroke-width="1" />
    <path d="M 26.6 31 L 31.7 31 L 31.7 49" stroke="#341f0d" stroke-width="0.9" opacity="0.8" />
    <path d="M 26.6 35 L 31.7 35" stroke="#d8c195" stroke-width="0.8" opacity="0.6" />
    <path d="M 26.6 39 L 31.7 39" stroke="#d8c195" stroke-width="0.8" opacity="0.6" />
    <path d="M 26.6 43 L 31.7 43" stroke="#d8c195" stroke-width="0.8" opacity="0.6" />
    <path d="M 39 14 L 45 12 L 44 19 L 39 18 Z" fill="#c5a36d" stroke="#341f0d" stroke-width="0.9" />
    <path d="M 44.2 12.4 L 44.2 6.6" stroke="#341f0d" stroke-width="0.9" />
  </g>
</svg>
`;

const siegeOutpostSvg = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <filter id="shadow" x="-24%" y="-24%" width="148%" height="148%">
      <feDropShadow dx="0" dy="1.15" stdDeviation="1.1" flood-color="#2e1c10" flood-opacity="0.42"/>
    </filter>
  </defs>
  <g filter="url(#shadow)">
    <path d="M 18 42 L 46 42 L 42 50 L 22 50 Z" fill="#5a3c23" stroke="#2e1c10" stroke-width="1.1" />
    <path d="M 23 38 L 41 38 L 39 42 L 25 42 Z" fill="#a57a46" opacity="0.95" />
    <circle cx="24" cy="50" r="4" fill="#6e6357" stroke="#2e1c10" stroke-width="1" />
    <circle cx="40" cy="50" r="4" fill="#6e6357" stroke="#2e1c10" stroke-width="1" />
    <circle cx="24" cy="50" r="1.4" fill="#d8c8aa" />
    <circle cx="40" cy="50" r="1.4" fill="#d8c8aa" />
    <path d="M 30 22 L 34 22 L 39 42 L 35 42 Z" fill="#5a3c23" stroke="#2e1c10" stroke-width="1" />
    <path d="M 24 39 L 32 23 L 40 39" fill="none" stroke="#7a5834" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M 32 19 L 32 8" fill="none" stroke="#5a3c23" stroke-width="2.2" stroke-linecap="round" />
    <path d="M 32 8 L 30 4.8 L 34 4.8 Z" fill="#d7b27a" stroke="#2e1c10" stroke-width="0.9" />
    <path d="M 28 22 C 29 18, 35 18, 36 22" fill="none" stroke="#d7c59e" stroke-width="0.9" opacity="0.8" />
    <path d="M 23 45 L 41 45" stroke="#d7c59e" stroke-width="0.8" opacity="0.55" />
  </g>
</svg>
`;

const svgFor = (family, opening) => {
  const colors = families[family];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <filter id="shadow" x="-24%" y="-24%" width="148%" height="148%">
      <feDropShadow dx="0" dy="1.15" stdDeviation="1.1" flood-color="${colors.shadow}" flood-opacity="0.42"/>
    </filter>
  </defs>
  <g filter="url(#shadow)">
    ${wallOrder.map((direction) => renderWall(direction, opening, colors)).join("")}
    ${["NW", "NE", "SW", "SE"].map((tower) => renderTower(tower, opening, colors)).join("")}
    ${crenels(opening, colors)}
    ${banner(opening, colors)}
  </g>
</svg>
`;
};

mkdirSync(outputDir, { recursive: true });
const ringFamilies = ["FORT", "WOODEN_FORT"];
for (const family of ringFamilies) {
  for (const opening of Object.keys(openings)) {
    const filename = `${families[family].prefix}-${openings[opening]}.svg`;
    writeFileSync(resolve(outputDir, filename), svgFor(family, opening));
  }
}
writeFileSync(resolve(outputDir, "light-outpost-overlay.svg"), lightOutpostSvg());
writeFileSync(resolve(outputDir, "siege-outpost-overlay.svg"), siegeOutpostSvg());
