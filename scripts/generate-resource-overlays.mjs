import fs from "node:fs";
import path from "node:path";

const outDir = path.resolve("packages/client/public/overlays");

const svg = (body) => `<svg width="128" height="128" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
${body}
</svg>
`;

const store = ({ x, y, w, h, base = "#B87934", front = "#D7E0EA", side = "#8E99AA", roof = "#F1C875" }) => `
  <path d="M${x} ${y + h}L${x + 18} ${y + h - 13}L${x + 18 + w} ${y + h - 13}L${x + w} ${y + h}H${x}Z" fill="${base}"/>
  <path d="M${x + 18} ${y + h - 13}L${x + 18} ${y}L${x + 18 + w} ${y}L${x + 18 + w} ${y + h - 13}H${x + 18}Z" fill="${front}"/>
  <path d="M${x + 18 + w} ${y + h - 13}L${x + 32 + w} ${y + h - 23}L${x + 32 + w} ${y + 10}L${x + 18 + w} ${y}V${y + h - 13}Z" fill="${side}"/>
  <path d="M${x + 18} ${y}L${x + 36} ${y - 10}L${x + 32 + w} ${y - 10}L${x + 18 + w} ${y}H${x + 18}Z" fill="${roof}"/>
`;

const shed = ({ x, y, w, h, front = "#C9924F", side = "#986532", roof = "#E3B26C" }) => `
  <path d="M${x} ${y + h}L${x + 12} ${y + h - 9}L${x + 12 + w} ${y + h - 9}L${x + w} ${y + h}H${x}Z" fill="${side}"/>
  <path d="M${x + 12} ${y + h - 9}L${x + 12} ${y}L${x + 12 + w} ${y}L${x + 12 + w} ${y + h - 9}H${x + 12}Z" fill="${front}"/>
  <path d="M${x + 12 + w} ${y + h - 9}L${x + 21 + w} ${y + h - 16}L${x + 21 + w} ${y + 7}L${x + 12 + w} ${y}V${y + h - 9}Z" fill="${side}"/>
  <path d="M${x + 12} ${y}L${x + 25} ${y - 7}L${x + 21 + w} ${y - 7}L${x + 12 + w} ${y}H${x + 12}Z" fill="${roof}"/>
`;

const crate = ({ x, y, w = 16, h = 12, front = "#C48C4F", side = "#976534", top = "#E4B774" }) => `
  <path d="M${x} ${y + h}L${x + 8} ${y + h - 6}L${x + 8 + w} ${y + h - 6}L${x + w} ${y + h}H${x}Z" fill="${side}"/>
  <path d="M${x + 8} ${y + h - 6}L${x + 8} ${y}L${x + 8 + w} ${y}L${x + 8 + w} ${y + h - 6}H${x + 8}Z" fill="${front}"/>
  <path d="M${x + 8 + w} ${y + h - 6}L${x + 14 + w} ${y + h - 10}L${x + 14 + w} ${y + 4}L${x + 8 + w} ${y}V${y + h - 6}Z" fill="${side}"/>
  <path d="M${x + 8} ${y}L${x + 14} ${y - 4}L${x + 14 + w} ${y - 4}L${x + 8 + w} ${y}H${x + 8}Z" fill="${top}"/>
`;

const barrel = ({ x, y, body = "#9B6A3A", hoop = "#515B68" }) => `
  <ellipse cx="${x + 6}" cy="${y + 3}" rx="6" ry="3" fill="#C48E53"/>
  <path d="M${x} ${y + 3}C${x + 1} ${y + 13}, ${x + 11} ${y + 13}, ${x + 12} ${y + 3}V${y + 14}C${x + 11} ${y + 22}, ${x + 1} ${y + 22}, ${x} ${y + 14}V${y + 3}Z" fill="${body}"/>
  <path d="M${x + 1} ${y + 9}H${x + 11}" stroke="${hoop}" stroke-width="2"/>
  <path d="M${x + 1} ${y + 16}H${x + 11}" stroke="${hoop}" stroke-width="2"/>
`;

const hay = ({ x, y, w = 18, h = 8, fill = "#D3B153" }) => `
  <ellipse cx="${x + w / 2}" cy="${y + h}" rx="${w / 2}" ry="${h}" fill="${fill}"/>
  <path d="M${x + 3} ${y + h}L${x + w / 2} ${y}L${x + w - 3} ${y + h}" fill="${fill}"/>
`;

const sack = ({ x, y, fill = "#C5A16B", tie = "#7A5636" }) => `
  <path d="M${x + 5} ${y}L${x + 9} ${y + 4}L${x + 9} ${y + 8}C${x + 13} ${y + 11}, ${x + 13} ${y + 19}, ${x + 7} ${y + 22}C${x + 1} ${y + 19}, ${x + 1} ${y + 11}, ${x + 5} ${y + 8}V${y + 4}L${x + 5} ${y}Z" fill="${fill}"/>
  <path d="M${x + 4} ${y + 6}H${x + 10}" stroke="${tie}" stroke-width="2" stroke-linecap="round"/>
`;

const sheaf = ({ x, y, fill = "#D8B552", band = "#8F5F34" }) => `
  <path d="M${x + 8} ${y}L${x + 3} ${y + 16}L${x + 13} ${y + 16}L${x + 8} ${y}Z" fill="${fill}"/>
  <path d="M${x + 5} ${y + 4}L${x + 1} ${y + 16}" stroke="${fill}" stroke-width="3" stroke-linecap="round"/>
  <path d="M${x + 11} ${y + 4}L${x + 15} ${y + 16}" stroke="${fill}" stroke-width="3" stroke-linecap="round"/>
  <path d="M${x + 3} ${y + 10}H${x + 13}" stroke="${band}" stroke-width="3" stroke-linecap="round"/>
`;

const cropStalk = ({ x, y, height = 28, grain = "#FFC91A", grainLight = "#FFE27A", stem = "#F4A10A", lean = 0, tiers = 4 }) => {
  const top = y;
  const bottom = y + height;
  const cx = x + 7 + lean;
  const tierGap = Math.max(4, Math.floor(height / (tiers + 1)));
  const grains = Array.from({ length: tiers }, (_, i) => {
    const gy = top + 6 + i * tierGap;
    const width = Math.max(5, 9 - i);
    return `
  <path d="M${cx} ${gy}L${cx - width} ${gy + 6}L${cx - 2} ${gy + 11}L${cx} ${gy + 9}V${gy}Z" fill="${i % 2 === 0 ? grain : grainLight}"/>
  <path d="M${cx} ${gy + 1}L${cx + width} ${gy + 6}L${cx + 2} ${gy + 11}L${cx} ${gy + 9}V${gy + 1}Z" fill="${i % 2 === 0 ? grainLight : grain}"/>
`;
  }).join("\n");
  return `
  <path d="M${cx} ${bottom}L${cx} ${top + 2}" stroke="${stem}" stroke-width="4" stroke-linecap="round"/>
  ${grains}
`;
};

const fieldPlot = ({ x, y, w = 28, h = 18, fill = "#D9B651", rows = "#E8D07C", border = "#B9923B" }) => {
  const rowLines = Array.from({ length: 6 }, (_, i) => {
    const y1 = y + 4 + i * 2;
    return `<path d="M${x + 4} ${y1 + 8}L${x + w - 3} ${y1}" stroke="${rows}" stroke-width="1.2" stroke-linecap="round"/>`;
  }).join("\n");
  return `
  <path d="M${x} ${y + h}L${x + 10} ${y + h - 7}L${x + 10 + w} ${y + h - 7}L${x + w} ${y + h}H${x}Z" fill="${border}"/>
  <path d="M${x + 10} ${y + h - 7}L${x + 10} ${y}L${x + 10 + w} ${y}L${x + 10 + w} ${y + h - 7}H${x + 10}Z" fill="${fill}"/>
  <path d="M${x + 10 + w} ${y + h - 7}L${x + 17 + w} ${y + h - 12}L${x + 17 + w} ${y - 5}L${x + 10 + w} ${y}V${y + h - 7}Z" fill="${fill}"/>
  <path d="M${x + 10} ${y}L${x + 17} ${y - 5}L${x + 17 + w} ${y - 5}L${x + 10 + w} ${y}H${x + 10}Z" fill="${fill}"/>
  ${rowLines}
`;
};

const fieldPath = ({ points, stroke = "#AA936A", width = 4 }) =>
  `<path d="${points}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>`;

const fieldBush = ({ x, y, fill = "#7C7A2D" }) => `
  <ellipse cx="${x + 8}" cy="${y + 7}" rx="8" ry="7" fill="${fill}"/>
  <ellipse cx="${x + 4}" cy="${y + 9}" rx="5" ry="4" fill="#6E6C27"/>
  <ellipse cx="${x + 11}" cy="${y + 4}" rx="5" ry="4" fill="#8B8833"/>
`;

const tent = ({ x, y, fill = "#A97745", side = "#7B542F", flap = "#D8B780" }) => `
  <path d="M${x} ${y + 20}L${x + 14} ${y}L${x + 28} ${y + 20}H${x}Z" fill="${fill}"/>
  <path d="M${x + 14} ${y}L${x + 28} ${y + 20}H${x + 14}Z" fill="${side}"/>
  <path d="M${x + 14} ${y + 3}L${x + 21} ${y + 20}H${x + 14}Z" fill="${flap}"/>
`;

const mineFrame = ({ x, y, width = 36, height = 26, wood = "#8B5D34", dark = "#3C2D1F" }) => `
  <path d="M${x} ${y + height}L${x + 7} ${y}L${x + 12} ${y}L${x + 6} ${y + height}H${x}Z" fill="${wood}"/>
  <path d="M${x + width - 6} ${y + height}L${x + width - 12} ${y}L${x + width - 7} ${y}L${x + width} ${y + height}H${x + width - 6}Z" fill="${wood}"/>
  <path d="M${x + 8} ${y + 4}H${x + width - 8}" stroke="#B88349" stroke-width="4" stroke-linecap="round"/>
  <path d="M${x + 12} ${y + height}L${x + width - 12} ${y + height}L${x + width - 18} ${y + 10}L${x + 18} ${y + 10}L${x + 12} ${y + height}Z" fill="${dark}"/>
`;

const rail = ({ x, y, len = 26 }) => `
  <path d="M${x} ${y}L${x + len} ${y + 6}" stroke="#6E5842" stroke-width="3" stroke-linecap="round"/>
  <path d="M${x + 1} ${y + 6}L${x + len + 1} ${y + 12}" stroke="#6E5842" stroke-width="3" stroke-linecap="round"/>
  <path d="M${x + 5} ${y + 1}L${x + 3} ${y + 8}" stroke="#9B7C59" stroke-width="2" stroke-linecap="round"/>
  <path d="M${x + 13} ${y + 3}L${x + 11} ${y + 10}" stroke="#9B7C59" stroke-width="2" stroke-linecap="round"/>
  <path d="M${x + 21} ${y + 5}L${x + 19} ${y + 12}" stroke="#9B7C59" stroke-width="2" stroke-linecap="round"/>
`;

const cart = ({ x, y, body = "#A06C36", wheel = "#3C4653" }) => `
  <path d="M${x} ${y + 12}L${x + 8} ${y + 6}H${x + 24}L${x + 18} ${y + 18}H${x + 6}L${x} ${y + 12}Z" fill="${body}"/>
  <circle cx="${x + 7}" cy="${y + 18}" r="5" fill="${wheel}"/>
  <circle cx="${x + 18}" cy="${y + 18}" r="5" fill="${wheel}"/>
  <circle cx="${x + 7}" cy="${y + 18}" r="2" fill="#B8C1CD"/>
  <circle cx="${x + 18}" cy="${y + 18}" r="2" fill="#B8C1CD"/>
`;

const smallHut = ({ x, y, front = "#D6D1C6", side = "#9EA7B5", roof = "#C48B46" }) => `
  <path d="M${x} ${y + 24}L${x + 10} ${y + 17}H${x + 30}L${x + 20} ${y + 24}H${x}Z" fill="#9A6B38"/>
  <path d="M${x + 10} ${y + 17}V${y + 4}H${x + 30}V${y + 17}H${x + 10}Z" fill="${front}"/>
  <path d="M${x + 30} ${y + 17}L${x + 40} ${y + 10}V${y - 3}L${x + 30} ${y + 4}V${y + 17}Z" fill="${side}"/>
  <path d="M${x + 10} ${y + 4}L${x + 20} ${y - 3}H${x + 40}L${x + 30} ${y + 4}H${x + 10}Z" fill="${roof}"/>
  <path d="M${x + 18} ${y + 17}V${y + 8}H${x + 24}V${y + 17}" fill="#2D394A"/>
`;

const stylizedBarleyPatch = ({
  x,
  y,
  scale = 6,
  stem = "#8B1E1E",
  gold = "#F5B21B",
  light = "#FFE17D",
  mid = "#F28D11",
  height = 1
}) => {
  const stemHeight = 4.1 * scale * height;
  const stemWidth = 0.55 * scale;
  const stemX = x + 3.7 * scale;
  const stemY = y + 6.2 * scale;
  const grain = ({ dx, dy, w, h, fill, lean = 0 }) => {
    const gx = x + dx * scale;
    const gy = y + dy * scale;
    const gw = w * scale;
    const gh = h * scale;
    return `<path d="M${gx + gw / 2} ${gy}L${gx + gw + lean * scale * 0.2} ${gy + gh * 0.58}L${gx + gw / 2} ${gy + gh}L${gx + lean * scale * 0.2} ${gy + gh * 0.58}Z" fill="${fill}"/>`;
  };
  const grains = [
    { dx: 2.9, dy: 0.0, w: 1.15, h: 1.5, fill: gold, lean: 0 },
    { dx: 1.75, dy: 1.05, w: 1.35, h: 1.45, fill: gold, lean: -0.35 },
    { dx: 3.0, dy: 1.0, w: 1.25, h: 1.45, fill: light, lean: 0 },
    { dx: 4.15, dy: 1.05, w: 1.35, h: 1.45, fill: gold, lean: 0.35 },
    { dx: 0.65, dy: 2.15, w: 1.45, h: 1.4, fill: gold, lean: -0.5 },
    { dx: 1.9, dy: 2.05, w: 1.35, h: 1.45, fill: light, lean: -0.2 },
    { dx: 3.05, dy: 1.95, w: 1.35, h: 1.5, fill: gold, lean: 0 },
    { dx: 4.2, dy: 2.05, w: 1.35, h: 1.45, fill: light, lean: 0.2 },
    { dx: 5.45, dy: 2.15, w: 1.45, h: 1.4, fill: gold, lean: 0.5 },
    { dx: 1.1, dy: 3.4, w: 1.35, h: 1.35, fill: mid, lean: -0.35 },
    { dx: 2.2, dy: 3.2, w: 1.35, h: 1.45, fill: gold, lean: -0.15 },
    { dx: 3.2, dy: 3.08, w: 1.3, h: 1.45, fill: light, lean: 0 },
    { dx: 4.25, dy: 3.2, w: 1.35, h: 1.45, fill: gold, lean: 0.15 },
    { dx: 5.35, dy: 3.4, w: 1.35, h: 1.35, fill: mid, lean: 0.35 },
    { dx: 2.25, dy: 4.45, w: 1.25, h: 1.3, fill: gold, lean: -0.1 },
    { dx: 3.2, dy: 4.32, w: 1.2, h: 1.35, fill: light, lean: 0 },
    { dx: 4.15, dy: 4.45, w: 1.25, h: 1.3, fill: gold, lean: 0.1 }
  ];
  return `
  <rect x="${stemX}" y="${stemY}" width="${stemWidth}" height="${stemHeight}" rx="${scale * 0.18}" fill="${stem}"/>
  ${grains
    .map(grain)
    .join("\n")}
`;
};

const fishRack = ({ x, y, count = 4 }) => {
  const fish = Array.from({ length: count }, (_, i) => {
    const fx = x + 9 + i * 8;
    return `<path d="M${fx} ${y + 9}C${fx + 2} ${y + 13}, ${fx + 2} ${y + 20}, ${fx} ${y + 24}C${fx - 2} ${y + 20}, ${fx - 2} ${y + 13}, ${fx} ${y + 9}Z" fill="#C8D2DA"/>`;
  }).join("\n");
  return `
  <path d="M${x} ${y + 28}L${x + 6} ${y}L${x + 11} ${y}L${x + 5} ${y + 28}H${x}Z" fill="#8B5D34"/>
  <path d="M${x + 35} ${y + 28}L${x + 29} ${y}L${x + 34} ${y}L${x + 40} ${y + 28}H${x + 35}Z" fill="#8B5D34"/>
  <path d="M${x + 7} ${y + 4}H${x + 31}" stroke="#B88349" stroke-width="4" stroke-linecap="round"/>
  ${fish}
`;
};

const logStack = ({ x, y, rows = 2, cols = 3 }) => {
  let parts = "";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lx = x + c * 8 - r * 3;
      const ly = y + r * 7;
      parts += `
  <ellipse cx="${lx + 7}" cy="${ly + 5}" rx="7" ry="5" fill="#8B5D34"/>
  <ellipse cx="${lx + 7}" cy="${ly + 5}" rx="4" ry="3" fill="#C08B54"/>
  <rect x="${lx + 7}" y="${ly}" width="16" height="10" fill="#7A5231"/>
`;
    }
  }
  return parts;
};

const pelt = ({ x, y, fill = "#8A613D" }) => `
  <path d="M${x + 7} ${y}L${x + 13} ${y + 5}L${x + 12} ${y + 12}L${x + 16} ${y + 19}L${x + 9} ${y + 23}L${x + 7} ${y + 28}L${x + 5} ${y + 23}L${x - 2} ${y + 19}L${x + 2} ${y + 12}L${x + 1} ${y + 5}L${x + 7} ${y}Z" fill="${fill}"/>
`;

const oreRock = ({ x, y, fill = "#7E848D", face = "#B7C0C9", veins = "#D8B56A" }) => `
  <path d="M${x + 8} ${y}L${x + 18} ${y + 5}L${x + 20} ${y + 14}L${x + 12} ${y + 22}L${x + 2} ${y + 20}L${x} ${y + 10}L${x + 8} ${y}Z" fill="${fill}"/>
  <path d="M${x + 8} ${y}L${x + 12} ${y + 8}L${x + 12} ${y + 22}L${x + 2} ${y + 20}L${x} ${y + 10}L${x + 8} ${y}Z" fill="${face}"/>
  <path d="M${x + 6} ${y + 6}L${x + 9} ${y + 14}" stroke="${veins}" stroke-width="2" stroke-linecap="round"/>
  <path d="M${x + 11} ${y + 8}L${x + 8} ${y + 18}" stroke="${veins}" stroke-width="2" stroke-linecap="round"/>
`;

const crystal = ({ x, y, fill = "#B175FF", side = "#7D57C4", top = "#E1C5FF" }) => `
  <path d="M${x + 6} ${y + 24}L${x} ${y + 10}L${x + 6} ${y}L${x + 13} ${y + 10}L${x + 6} ${y + 24}Z" fill="${fill}"/>
  <path d="M${x + 6} ${y}L${x + 12} ${y + 10}L${x + 18} ${y + 4}L${x + 12} ${y - 4}L${x + 6} ${y}Z" fill="${top}"/>
  <path d="M${x + 13} ${y + 10}L${x + 18} ${y + 4}V${y + 17}L${x + 6} ${y + 24}L${x + 13} ${y + 10}Z" fill="${side}"/>
`;

const crystalSpire = ({ x, y, height = 34, width = 14, fill = "#B175FF", side = "#7D57C4", top = "#E1C5FF" }) => `
  <path d="M${x + width / 2} ${y + height}L${x} ${y + Math.floor(height * 0.42)}L${x + width / 2} ${y}L${x + width} ${y + Math.floor(height * 0.42)}L${x + width / 2} ${y + height}Z" fill="${fill}"/>
  <path d="M${x + width / 2} ${y}L${x + width * 0.82} ${y + Math.floor(height * 0.28)}L${x + width + 5} ${y + Math.floor(height * 0.12)}L${x + width * 0.82} ${y - 4}L${x + width / 2} ${y}Z" fill="${top}"/>
  <path d="M${x + width} ${y + Math.floor(height * 0.42)}L${x + width + 5} ${y + Math.floor(height * 0.12)}V${y + Math.floor(height * 0.7)}L${x + width / 2} ${y + height}L${x + width} ${y + Math.floor(height * 0.42)}Z" fill="${side}"/>
`;

const crystalDeposit = ({ x, y, fill = "#B175FF", side = "#7D57C4", top = "#E1C5FF" }) => `
  <ellipse cx="${x + 26}" cy="${y + 34}" rx="22" ry="7" fill="rgba(84,52,138,0.18)"/>
  ${crystalSpire({ x: x + 18, y: y, height: 36, width: 16, fill, side, top })}
  ${crystalSpire({ x: x + 6, y: y + 11, height: 24, width: 11, fill: "#9568EC", side: "#6747AF", top: "#DCC9FF" })}
  ${crystalSpire({ x: x + 33, y: y + 13, height: 22, width: 10, fill: "#8A62DF", side: "#5C409D", top: "#D4C0FF" })}
  ${crystalSpire({ x: x + 0, y: y + 18, height: 16, width: 8, fill: "#7A58D0", side: "#533A92", top: "#CAB8F2" })}
  ${crystalSpire({ x: x + 43, y: y + 19, height: 15, width: 8, fill: "#7E5AD6", side: "#563B97", top: "#D2C1F9" })}
`;

const crystalPebbles = ({ x, y, items = [[0, 10], [10, 4], [23, 0], [35, 6], [48, 12], [15, 18], [40, 20]] }) =>
  items
    .map(
      ([dx, dy]) => `
  <ellipse cx="${x + dx + 3}" cy="${y + dy + 2}" rx="3.5" ry="2.5" fill="#85735F"/>
  <ellipse cx="${x + dx + 3}" cy="${y + dy + 2}" rx="2" ry="1.4" fill="#B39D83"/>
`
    )
    .join("\n");

const crystalReferenceDeposit = ({ x, y, fill = "#4CC3FF", side = "#1E7FD7", top = "#D6F5FF" }) => `
  <ellipse cx="${x + 30}" cy="${y + 42}" rx="30" ry="10" fill="rgba(85,68,48,0.18)"/>
  ${crystalPebbles({ x: x + 1, y: y + 26 })}
  ${crystalSpire({ x: x + 22, y: y, height: 42, width: 18, fill, side, top })}
  ${crystalSpire({ x: x + 10, y: y + 11, height: 28, width: 13, fill: "#63D2FF", side: "#2A8CE0", top: "#E4FAFF" })}
  ${crystalSpire({ x: x + 38, y: y + 13, height: 30, width: 13, fill: "#57C9FF", side: "#2485DD", top: "#E2F9FF" })}
  ${crystalSpire({ x: x + 2, y: y + 23, height: 18, width: 9, fill: "#75DCFF", side: "#3797E7", top: "#E9FCFF" })}
  ${crystalSpire({ x: x + 49, y: y + 24, height: 17, width: 9, fill: "#70D8FF", side: "#328FE1", top: "#E8FBFF" })}
  ${crystalSpire({ x: x + 16, y: y + 25, height: 20, width: 10, fill: "#6ED7FF", side: "#2E8FE1", top: "#E8FBFF" })}
  ${crystalSpire({ x: x + 35, y: y + 27, height: 19, width: 10, fill: "#64D0FF", side: "#2688DE", top: "#E5FAFF" })}
`;

const crystalReferenceGroup = ({
  x,
  y,
  scale = 1,
  fill = "#4CC3FF",
  side = "#1E7FD7",
  top = "#D6F5FF"
}) => `
  <g transform="translate(${x} ${y}) scale(${scale})">
    ${crystalReferenceDeposit({ x: 0, y: 0, fill, side, top })}
  </g>
`;

const files = {
  "farm-overlay-1.svg": svg(`
${stylizedBarleyPatch({ x: 14, y: 34, scale: 6, height: 1 })}
${stylizedBarleyPatch({ x: 44, y: 22, scale: 7, gold: "#F8BA1D", light: "#FFE58B", mid: "#F39213", height: 1.2 })}
${stylizedBarleyPatch({ x: 84, y: 36, scale: 6, gold: "#F3AE18", light: "#FFDD72", mid: "#EB8610", height: 1 })}
`),
  "farm-overlay-2.svg": svg(`
${stylizedBarleyPatch({ x: 12, y: 38, scale: 6, gold: "#F2AC18", light: "#FFDD73", mid: "#EA8610", height: 0.95 })}
${stylizedBarleyPatch({ x: 44, y: 20, scale: 7, gold: "#F9BE22", light: "#FFE792", mid: "#F59716", height: 1.25 })}
${stylizedBarleyPatch({ x: 85, y: 30, scale: 6, gold: "#F4B31A", light: "#FFE07D", mid: "#EF8E12", height: 1.08 })}
`),
  "farm-overlay-3.svg": svg(`
${stylizedBarleyPatch({ x: 18, y: 26, scale: 6, gold: "#F5B21B", light: "#FFE17D", mid: "#F28D11", height: 1.25 })}
${stylizedBarleyPatch({ x: 50, y: 30, scale: 6, gold: "#F8BB20", light: "#FFE68E", mid: "#F39314", height: 1.1 })}
${stylizedBarleyPatch({ x: 82, y: 40, scale: 5, gold: "#F1A915", light: "#FFDA6A", mid: "#E8830F", height: 0.92 })}
`),
  "fish-overlay-1.svg": svg(`
${fishRack({ x: 24, y: 54, count: 4 })}
${barrel({ x: 82, y: 78 })}
`),
  "fish-overlay-2.svg": svg(`
${fishRack({ x: 20, y: 51, count: 5 })}
${barrel({ x: 80, y: 79, body: "#8C5D34" })}
${barrel({ x: 93, y: 75, body: "#7F542F" })}
`),
  "fish-overlay-3.svg": svg(`
${fishRack({ x: 54, y: 50, count: 4 })}
${barrel({ x: 18, y: 77 })}
${barrel({ x: 31, y: 82, body: "#875A32" })}
`),
  "fur-overlay-1.svg": svg(`
  <path d="M25 60L31 86" stroke="#8C5E35" stroke-width="4" stroke-linecap="round"/>
  <path d="M42 60L36 86" stroke="#8C5E35" stroke-width="4" stroke-linecap="round"/>
  <path d="M25 60H42" stroke="#B88349" stroke-width="4" stroke-linecap="round"/>
  <path d="M73 53L79 78" stroke="#8C5E35" stroke-width="4" stroke-linecap="round"/>
  <path d="M90 53L84 78" stroke="#8C5E35" stroke-width="4" stroke-linecap="round"/>
  <path d="M73 53H90" stroke="#B88349" stroke-width="4" stroke-linecap="round"/>
${pelt({ x: 24, y: 66, fill: "#89613D" })}
${pelt({ x: 35, y: 68, fill: "#A87C55" })}
${pelt({ x: 72, y: 59, fill: "#8B633F" })}
${pelt({ x: 83, y: 60, fill: "#A67950" })}
`),
  "fur-overlay-2.svg": svg(`
  <path d="M27 54L33 81" stroke="#8B5D34" stroke-width="4" stroke-linecap="round"/>
  <path d="M46 54L40 81" stroke="#8B5D34" stroke-width="4" stroke-linecap="round"/>
  <path d="M27 54H46" stroke="#B88349" stroke-width="4" stroke-linecap="round"/>
  <path d="M74 58L80 84" stroke="#8B5D34" stroke-width="4" stroke-linecap="round"/>
  <path d="M93 58L87 84" stroke="#8B5D34" stroke-width="4" stroke-linecap="round"/>
  <path d="M74 58H93" stroke="#B88349" stroke-width="4" stroke-linecap="round"/>
${pelt({ x: 27, y: 61, fill: "#8A603C" })}
${pelt({ x: 39, y: 62, fill: "#B2865D" })}
${pelt({ x: 73, y: 64, fill: "#89603D" })}
${pelt({ x: 84, y: 66, fill: "#A97B52" })}
`),
  "fur-overlay-3.svg": svg(`
  <path d="M24 58L30 84" stroke="#8C5D34" stroke-width="4" stroke-linecap="round"/>
  <path d="M43 58L37 84" stroke="#8C5D34" stroke-width="4" stroke-linecap="round"/>
  <path d="M24 58H43" stroke="#B88349" stroke-width="4" stroke-linecap="round"/>
  <path d="M74 58L80 84" stroke="#8C5D34" stroke-width="4" stroke-linecap="round"/>
  <path d="M93 58L87 84" stroke="#8C5D34" stroke-width="4" stroke-linecap="round"/>
  <path d="M74 58H93" stroke="#B88349" stroke-width="4" stroke-linecap="round"/>
${pelt({ x: 21, y: 72, fill: "#89603B" })}
${pelt({ x: 25, y: 65, fill: "#A17A56" })}
${pelt({ x: 73, y: 64, fill: "#8A613D" })}
${pelt({ x: 84, y: 66, fill: "#B08561" })}
`),
  "iron-overlay-1.svg": svg(`
${oreRock({ x: 18, y: 73 })}
${oreRock({ x: 39, y: 81, fill: "#737A84", face: "#AEB7C1" })}
${oreRock({ x: 72, y: 70, fill: "#818891", face: "#C0C8D1" })}
${oreRock({ x: 92, y: 80, fill: "#6F767F", face: "#A7B0BA" })}
`),
  "iron-overlay-2.svg": svg(`
${oreRock({ x: 20, y: 78, fill: "#787F88", face: "#B4BDC6" })}
${oreRock({ x: 48, y: 72, fill: "#6F767F", face: "#AAB3BC" })}
${oreRock({ x: 76, y: 79, fill: "#88919A", face: "#C3CBD3" })}
`),
  "iron-overlay-3.svg": svg(`
${oreRock({ x: 18, y: 79, fill: "#747B85", face: "#B1BAC3" })}
${oreRock({ x: 48, y: 82, fill: "#6D747D", face: "#A6AFB8" })}
${oreRock({ x: 78, y: 73, fill: "#848C96", face: "#BDC6CF" })}
${oreRock({ x: 96, y: 82, fill: "#727A84", face: "#ADB6C0" })}
`),
  "gems-overlay-1.svg": svg(`
${crystalReferenceGroup({ x: 34, y: 52, scale: 1 })}
`),
  "gems-overlay-2.svg": svg(`
${crystalReferenceGroup({ x: 14, y: 58, scale: 0.74, fill: "#52C8FF", side: "#2184DB", top: "#DFF8FF" })}
${crystalReferenceGroup({ x: 60, y: 48, scale: 0.9, fill: "#46BFFF", side: "#1A7DD4", top: "#D8F4FF" })}
`),
  "gems-overlay-3.svg": svg(`
${crystalReferenceGroup({ x: 8, y: 62, scale: 0.62, fill: "#63D2FF", side: "#2A8CE0", top: "#E4FAFF" })}
${crystalReferenceGroup({ x: 42, y: 52, scale: 0.7, fill: "#52C8FF", side: "#2184DB", top: "#DFF8FF" })}
${crystalReferenceGroup({ x: 78, y: 64, scale: 0.56, fill: "#71DAFF", side: "#3394E5", top: "#EAFCFF" })}
`),
  "gems-overlay-4.svg": svg(`
${crystalReferenceGroup({ x: 20, y: 54, scale: 0.84, fill: "#3FB9FF", side: "#1879D2", top: "#D8F3FF" })}
${crystalReferenceGroup({ x: 72, y: 58, scale: 0.66, fill: "#5DCEFF", side: "#2488DC", top: "#E2F8FF" })}
`),
  "farm-farmstead-overlay-1.svg": svg(`
${stylizedBarleyPatch({ x: 8, y: 38, scale: 5, gold: "#F2B319", light: "#FFE07A", mid: "#EA8E12", height: 0.9 })}
${stylizedBarleyPatch({ x: 32, y: 28, scale: 5, gold: "#F7BC1E", light: "#FFE78E", mid: "#F29114", height: 1.05 })}
${smallHut({ x: 60, y: 56, roof: "#C98B43" })}
${hay({ x: 56, y: 86, w: 18, h: 7, fill: "#CFB052" })}
${hay({ x: 82, y: 83, w: 16, h: 6, fill: "#DABC62" })}
`),
  "farm-farmstead-overlay-2.svg": svg(`
${stylizedBarleyPatch({ x: 12, y: 42, scale: 5, gold: "#F2AF18", light: "#FFDD73", mid: "#E98711", height: 0.88 })}
${smallHut({ x: 42, y: 52, roof: "#D1964D" })}
${stylizedBarleyPatch({ x: 78, y: 32, scale: 5, gold: "#F8BF24", light: "#FFE892", mid: "#F49517", height: 1.08 })}
${barrel({ x: 82, y: 86, body: "#8B5D34" })}
`),
  "farm-farmstead-overlay-3.svg": svg(`
${smallHut({ x: 18, y: 58, roof: "#CA8D46" })}
${stylizedBarleyPatch({ x: 56, y: 26, scale: 6, gold: "#F6B71B", light: "#FFE481", mid: "#EF9014", height: 1.06 })}
${stylizedBarleyPatch({ x: 86, y: 40, scale: 4.8, gold: "#F1A814", light: "#FFD967", mid: "#E58110", height: 0.86 })}
${hay({ x: 26, y: 88, w: 16, h: 6, fill: "#D3B55E" })}
`),
  "fish-farmstead-overlay-1.svg": svg(`
${fishRack({ x: 18, y: 54, count: 4 })}
${smallHut({ x: 64, y: 56, roof: "#B9884A" })}
${barrel({ x: 86, y: 82, body: "#8B5D34" })}
`),
  "fish-farmstead-overlay-2.svg": svg(`
${smallHut({ x: 18, y: 54, roof: "#C08C4A" })}
${fishRack({ x: 62, y: 50, count: 4 })}
${barrel({ x: 28, y: 84, body: "#875A32" })}
${barrel({ x: 40, y: 88, body: "#9B6A3A" })}
`),
  "fish-farmstead-overlay-3.svg": svg(`
${fishRack({ x: 18, y: 48, count: 5 })}
${smallHut({ x: 60, y: 60, roof: "#C8924E" })}
${barrel({ x: 92, y: 86, body: "#8C5D34" })}
`),
  "fur-camp-overlay-1.svg": svg(`
${tent({ x: 14, y: 62 })}
  <path d="M64 56L70 84" stroke="#8C5E35" stroke-width="4" stroke-linecap="round"/>
  <path d="M83 56L77 84" stroke="#8C5E35" stroke-width="4" stroke-linecap="round"/>
  <path d="M64 56H83" stroke="#B88349" stroke-width="4" stroke-linecap="round"/>
${pelt({ x: 62, y: 64, fill: "#8A613D" })}
${pelt({ x: 74, y: 66, fill: "#A97B52" })}
`),
  "fur-camp-overlay-2.svg": svg(`
  <path d="M18 56L24 84" stroke="#8C5E35" stroke-width="4" stroke-linecap="round"/>
  <path d="M37 56L31 84" stroke="#8C5E35" stroke-width="4" stroke-linecap="round"/>
  <path d="M18 56H37" stroke="#B88349" stroke-width="4" stroke-linecap="round"/>
${pelt({ x: 17, y: 63, fill: "#8A603C" })}
${tent({ x: 62, y: 62, fill: "#A3703E", side: "#78522E" })}
${barrel({ x: 96, y: 86, body: "#865A32" })}
`),
  "fur-camp-overlay-3.svg": svg(`
${tent({ x: 12, y: 64, fill: "#A97745" })}
${tent({ x: 40, y: 58, fill: "#956638", side: "#6E4A28", flap: "#CFAE7B" })}
  <path d="M82 54L88 82" stroke="#8C5E35" stroke-width="4" stroke-linecap="round"/>
  <path d="M101 54L95 82" stroke="#8C5E35" stroke-width="4" stroke-linecap="round"/>
  <path d="M82 54H101" stroke="#B88349" stroke-width="4" stroke-linecap="round"/>
${pelt({ x: 83, y: 62, fill: "#89603B" })}
`),
  "iron-mine-overlay-1.svg": svg(`
${mineFrame({ x: 46, y: 54 })}
${oreRock({ x: 12, y: 72, fill: "#7E848D", face: "#B7C0C9" })}
${oreRock({ x: 84, y: 76, fill: "#737A84", face: "#AEB7C1" })}
${rail({ x: 56, y: 84, len: 26 })}
${cart({ x: 76, y: 78, body: "#8E6033" })}
`),
  "iron-mine-overlay-2.svg": svg(`
${oreRock({ x: 14, y: 72, fill: "#787F88", face: "#B4BDC6" })}
${mineFrame({ x: 52, y: 50, width: 34, height: 28 })}
${oreRock({ x: 92, y: 72, fill: "#88919A", face: "#C3CBD3" })}
${rail({ x: 48, y: 86, len: 30 })}
`),
  "iron-mine-overlay-3.svg": svg(`
${mineFrame({ x: 22, y: 56, width: 34, height: 26 })}
${cart({ x: 54, y: 80, body: "#9A6B39" })}
${oreRock({ x: 80, y: 70, fill: "#7B828B", face: "#B8C0C8" })}
${oreRock({ x: 94, y: 82, fill: "#6F767F", face: "#AAB3BC" })}
${rail({ x: 44, y: 84, len: 24 })}
`),
  "gems-mine-overlay-1.svg": svg(`
${mineFrame({ x: 46, y: 54, width: 34, height: 26 })}
${crystalReferenceGroup({ x: 8, y: 66, scale: 0.42, fill: "#57C9FF", side: "#2485DD", top: "#E2F9FF" })}
${crystalReferenceGroup({ x: 80, y: 70, scale: 0.36, fill: "#63D2FF", side: "#2A8CE0", top: "#E4FAFF" })}
${rail({ x: 54, y: 84, len: 24 })}
`),
  "gems-mine-overlay-2.svg": svg(`
${crystalReferenceGroup({ x: 10, y: 68, scale: 0.34, fill: "#52C8FF", side: "#2184DB", top: "#DFF8FF" })}
${mineFrame({ x: 50, y: 50, width: 36, height: 28 })}
${cart({ x: 84, y: 78, body: "#916337" })}
${crystalReferenceGroup({ x: 92, y: 78, scale: 0.22, fill: "#71DAFF", side: "#3394E5", top: "#EAFCFF" })}
`),
  "gems-mine-overlay-3.svg": svg(`
${mineFrame({ x: 18, y: 56, width: 34, height: 26 })}
${crystalReferenceGroup({ x: 64, y: 62, scale: 0.42, fill: "#46BFFF", side: "#1A7DD4", top: "#D8F4FF" })}
${crystalReferenceGroup({ x: 94, y: 80, scale: 0.22, fill: "#70D8FF", side: "#328FE1", top: "#E8FBFF" })}
${rail({ x: 40, y: 84, len: 22 })}
`),
  "gems-mine-overlay-4.svg": svg(`
${crystalReferenceGroup({ x: 8, y: 68, scale: 0.26, fill: "#75DCFF", side: "#3797E7", top: "#E9FCFF" })}
${mineFrame({ x: 44, y: 52, width: 34, height: 27 })}
${crystalReferenceGroup({ x: 78, y: 62, scale: 0.36, fill: "#5DCEFF", side: "#2488DC", top: "#E2F8FF" })}
${cart({ x: 86, y: 80, body: "#98693A" })}
`)
};

fs.mkdirSync(outDir, { recursive: true });
for (const [name, contents] of Object.entries(files)) {
  fs.writeFileSync(path.join(outDir, name), contents);
}
