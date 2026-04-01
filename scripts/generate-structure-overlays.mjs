import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const outDir = path.resolve("packages/client/public/overlays");

const svg = (body) => `<svg width="128" height="128" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
${body}
</svg>
`;

const isoBase = ({ front = "#D9D0C2", side = "#A3A9B3", roof = "#C08A47", x = 28, y = 96, w = 44, h = 30, depth = 20 }) => {
  const left = x;
  const top = y - h;
  const right = x + w;
  const roofFront = top;
  return `
  <path d="M${left - 16} ${y}L${left} ${y - 10}H${right}L${right - 16} ${y}H${left - 16}Z" fill="#8E6236"/>
  <path d="M${left} ${y - 10}V${top}H${right}V${y - 10}H${left}Z" fill="${front}"/>
  <path d="M${right} ${y - 10}L${right + depth} ${y - 22}V${top - 12}L${right} ${top}V${y - 10}Z" fill="${side}"/>
  <path d="M${left} ${top}L${left + 18} ${top - 12}H${right + depth}L${right} ${top}H${left}Z" fill="${roof}"/>
`;
};

const door = ({ x, y, w = 8, h = 14, fill = "#334255" }) => `<path d="M${x} ${y}V${y - h}H${x + w}V${y}H${x}Z" fill="${fill}"/>`;
const windowRect = ({ x, y, w = 7, h = 7, fill = "#A7E8F5" }) => `<path d="M${x} ${y}V${y - h}H${x + w}V${y}H${x}Z" fill="${fill}"/>`;
const barrel = ({ x, y, body = "#9B6A3A", top = "#D3A265" }) => `
  <ellipse cx="${x + 6}" cy="${y}" rx="6" ry="3.5" fill="${top}"/>
  <path d="M${x} ${y}C${x + 1} ${y + 11}, ${x + 11} ${y + 11}, ${x + 12} ${y}V${y + 12}C${x + 11} ${y + 19}, ${x + 1} ${y + 19}, ${x} ${y + 12}V${y}Z" fill="${body}"/>
  <path d="M${x + 1} ${y + 7}H${x + 11}" stroke="#505A67" stroke-width="2"/>
  <path d="M${x + 1} ${y + 13}H${x + 11}" stroke="#505A67" stroke-width="2"/>
`;
const crate = ({ x, y, body = "#B18048", edge = "#7A542E" }) => `
  <path d="M${x} ${y + 9}L${x + 9} ${y + 4}H${x + 21}L${x + 12} ${y + 9}H${x}Z" fill="${body}"/>
  <path d="M${x + 9} ${y + 4}V${y - 8}H${x + 21}V${y + 4}H${x + 9}Z" fill="#D4A86D"/>
  <path d="M${x + 21} ${y + 4}L${x + 29} ${y - 1}V${y - 13}L${x + 21} ${y - 8}V${y + 4}Z" fill="${edge}"/>
`;
const gear = ({ cx, cy, r = 8, fill = "#818A95" }) => `
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>
  <circle cx="${cx}" cy="${cy}" r="${Math.max(2, r - 4)}" fill="#D5DCE4"/>
  <path d="M${cx} ${cy - r - 4}V${cy - r + 1}M${cx + r + 4} ${cy}H${cx + r - 1}M${cx} ${cy + r + 4}V${cy + r - 1}M${cx - r - 4} ${cy}H${cx - r + 1}" stroke="${fill}" stroke-width="3" stroke-linecap="round"/>
`;
const chimney = ({ x, y }) => `
  <path d="M${x} ${y}V${y - 18}H${x + 8}V${y}H${x}Z" fill="#7E868F"/>
  <path d="M${x + 1} ${y - 18}L${x + 5} ${y - 22}H${x + 11}L${x + 7} ${y - 18}H${x + 1}Z" fill="#A1AAB5"/>
`;
const mast = ({ x, y, h = 34, sail = "#F1E6D1" }) => `
  <path d="M${x} ${y}V${y - h}" stroke="#805733" stroke-width="4" stroke-linecap="round"/>
  <path d="M${x + 2} ${y - h + 4}L${x + 20} ${y - h + 14}V${y - 4}L${x + 2} ${y - 12}V${y - h + 4}Z" fill="${sail}"/>
`;
const antenna = ({ x, y, h = 30 }) => `
  <path d="M${x} ${y}V${y - h}" stroke="#616C79" stroke-width="4" stroke-linecap="round"/>
  <path d="M${x - 10} ${y - h + 8}L${x} ${y - h}" stroke="#9FB6D7" stroke-width="3" stroke-linecap="round"/>
  <path d="M${x + 10} ${y - h + 8}L${x} ${y - h}" stroke="#9FB6D7" stroke-width="3" stroke-linecap="round"/>
  <path d="M${x - 14} ${y - h + 17}L${x} ${y - h + 9}" stroke="#9FB6D7" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M${x + 14} ${y - h + 17}L${x} ${y - h + 9}" stroke="#9FB6D7" stroke-width="2.5" stroke-linecap="round"/>
`;
const coinStack = ({ x, y }) => `
  <ellipse cx="${x + 8}" cy="${y}" rx="8" ry="4" fill="#F1D26B"/>
  <path d="M${x} ${y}C${x + 2} ${y + 8}, ${x + 14} ${y + 8}, ${x + 16} ${y}V${y + 9}C${x + 14} ${y + 16}, ${x + 2} ${y + 16}, ${x} ${y + 9}V${y}Z" fill="#D7A53E"/>
  <path d="M${x + 2} ${y + 6}H${x + 14}" stroke="#F8E7A3" stroke-width="2"/>
`;
const crystal = ({ x, y, fill = "#65D2FF", side = "#2A8CE0", top = "#E8FBFF", scale = 1 }) => {
  const pts = [
    [0, 24], [8, 4], [15, 0], [22, 8], [18, 30], [6, 32]
  ];
  const p = pts.map(([px, py]) => `${x + px * scale} ${y + py * scale}`).join("L");
  return `
  <path d="M${p}Z" fill="${fill}"/>
  <path d="M${x + 15 * scale} ${y}L${x + 22 * scale} ${y + 8 * scale}L${x + 18 * scale} ${y + 30 * scale}L${x + 14 * scale} ${y + 24 * scale}Z" fill="${side}"/>
  <path d="M${x + 8 * scale} ${y + 4 * scale}L${x + 15 * scale} ${y}L${x + 22 * scale} ${y + 8 * scale}L${x + 13 * scale} ${y + 11 * scale}Z" fill="${top}"/>
`;
};
const wave = ({ x, y, color = "#78BDE6" }) => `<path d="M${x} ${y}C${x + 8} ${y - 6}, ${x + 20} ${y - 6}, ${x + 28} ${y}" stroke="${color}" stroke-width="3" stroke-linecap="round"/>`;
const banner = ({ x, y, fill = "#C14A36" }) => `
  <path d="M${x} ${y}V${y - 20}" stroke="#7B552F" stroke-width="3" stroke-linecap="round"/>
  <path d="M${x + 2} ${y - 20}L${x + 16} ${y - 16}L${x + 2} ${y - 8}V${y - 20}Z" fill="${fill}"/>
`;
const windsock = ({ x, y }) => `
  <path d="M${x} ${y}V${y - 24}" stroke="#7A5531" stroke-width="3" stroke-linecap="round"/>
  <path d="M${x + 2} ${y - 22}L${x + 18} ${y - 18}L${x + 8} ${y - 12}L${x + 2} ${y - 13}V${y - 22}Z" fill="#C85D40"/>
  <path d="M${x + 10} ${y - 20}L${x + 15} ${y - 19}L${x + 9} ${y - 15}L${x + 6} ${y - 15.5}Z" fill="#F0DFCC"/>
`;

const files = {
  "bank-overlay.svg": svg(`
${isoBase({ front: "#E5D9C6", side: "#A8B0BA", roof: "#B88B3E", x: 34, y: 98, w: 40, h: 30, depth: 18 })}
${door({ x: 50, y: 88, w: 9, h: 14 })}
${windowRect({ x: 63, y: 79, w: 8, h: 8, fill: "#F7EDBD" })}
${coinStack({ x: 24, y: 84 })}
${coinStack({ x: 78, y: 88 })}
  <path d="M58 60C64 54, 74 55, 79 61" stroke="#F6E7A0" stroke-width="4" stroke-linecap="round"/>
  <path d="M58 63H79" stroke="#D8B55A" stroke-width="3" stroke-linecap="round"/>
`),
  "airport-overlay.svg": svg(`
  <path d="M18 102L52 84H101L67 102H18Z" fill="#7C868F"/>
  <path d="M52 84L86 66H119L85 84H52Z" fill="#96A4B5"/>
  <path d="M36 93L46 88" stroke="#EAEFF5" stroke-width="3" stroke-linecap="round"/>
  <path d="M56 83L66 78" stroke="#EAEFF5" stroke-width="3" stroke-linecap="round"/>
  <path d="M76 73L86 68" stroke="#EAEFF5" stroke-width="3" stroke-linecap="round"/>
  <path d="M28 89L46 76H76L58 89H28Z" fill="#93663A"/>
  <path d="M46 76V58H76V76H46Z" fill="#DCE2E9"/>
  <path d="M76 76L96 66V48L76 58V76Z" fill="#99A7BA"/>
  <path d="M46 58L64 48H96L76 58H46Z" fill="#BF8543"/>
  <path d="M52 67H70" stroke="#77889C" stroke-width="3" stroke-linecap="round"/>
  <path d="M52 72H70" stroke="#77889C" stroke-width="3" stroke-linecap="round"/>
  <path d="M80 58V42" stroke="#68798D" stroke-width="4" stroke-linecap="round"/>
  <path d="M74 45H86" stroke="#A7DFFF" stroke-width="3" stroke-linecap="round"/>
${windsock({ x: 105, y: 82 })}
  <path d="M58 57L76 49L89 55L71 63L58 57Z" fill="#E3EAF1"/>
  <path d="M71 63L84 70" stroke="#5A6672" stroke-width="3" stroke-linecap="round"/>
  <path d="M67 58L52 65" stroke="#5A6672" stroke-width="4" stroke-linecap="round"/>
  <path d="M74 54L88 47" stroke="#5A6672" stroke-width="4" stroke-linecap="round"/>
  <circle cx="81" cy="68" r="4" fill="#2F4055"/>
  <circle cx="90" cy="63" r="4" fill="#2F4055"/>
  <path d="M92 51L98 48L97 56" fill="#DDE6EE"/>
`),
  "quartermaster-overlay.svg": svg(`
${isoBase({ front: "#D8CFBF", side: "#A3A19F", roof: "#C6934C", x: 36, y: 98, w: 40, h: 28, depth: 18 })}
${crate({ x: 18, y: 89 })}
${barrel({ x: 84, y: 83, body: "#8B5D34" })}
${barrel({ x: 96, y: 89, body: "#A06C36" })}
  <path d="M50 70H66" stroke="#8B5D34" stroke-width="4" stroke-linecap="round"/>
  <path d="M57 63V79" stroke="#8B5D34" stroke-width="4" stroke-linecap="round"/>
`),
  "ironworks-overlay.svg": svg(`
${isoBase({ front: "#C8CCD2", side: "#8E98A6", roof: "#8A6A4C", x: 30, y: 100, w: 42, h: 28, depth: 22 })}
${chimney({ x: 78, y: 71 })}
${gear({ cx: 39, cy: 92, r: 8 })}
  <path d="M87 88L95 76L104 88L95 100L87 88Z" fill="#D4A14F"/>
  <path d="M95 76V100" stroke="#7E5A2F" stroke-width="2"/>
  <path d="M93 48C97 44, 103 46, 104 52" stroke="#C4C9CF" stroke-width="4" stroke-linecap="round"/>
`),
  "crystal-synthesizer-overlay.svg": svg(`
${isoBase({ front: "#D4DCE7", side: "#96A4B8", roof: "#6B93D9", x: 30, y: 100, w: 42, h: 26, depth: 22 })}
${crystal({ x: 83, y: 67, scale: 0.95 })}
${crystal({ x: 22, y: 82, scale: 0.62, fill: "#89E2FF", side: "#46A6EA" })}
  <path d="M48 70L62 61L76 70L62 78L48 70Z" fill="#BFE9FF"/>
  <path d="M62 61V78" stroke="#7DCDF5" stroke-width="3"/>
`),
  "fuel-plant-overlay.svg": svg(`
${isoBase({ front: "#CFC7B9", side: "#969A9E", roof: "#8A704E", x: 28, y: 100, w: 46, h: 24, depth: 22 })}
${chimney({ x: 80, y: 74 })}
  <ellipse cx="33" cy="95" rx="11" ry="7" fill="#50606E"/>
  <path d="M22 95C23 108, 43 108, 44 95V107C43 116, 23 116, 22 107V95Z" fill="#6A7987"/>
  <path d="M37 84C34 77, 38 71, 43 67C46 73, 46 79, 43 85C41 88, 39 88, 37 84Z" fill="#F0A53D"/>
  <path d="M91 55C95 51, 101 53, 102 59" stroke="#D2D7DC" stroke-width="4" stroke-linecap="round"/>
`),
  "caravanary-overlay.svg": svg(`
${isoBase({ front: "#E3D4BE", side: "#AA9A83", roof: "#B46D35", x: 34, y: 96, w: 42, h: 28, depth: 18 })}
${banner({ x: 86, y: 87, fill: "#C68E33" })}
  <ellipse cx="29" cy="93" rx="9" ry="5" fill="#9B7245"/>
  <path d="M20 93C23 84, 35 84, 38 93" stroke="#7A552E" stroke-width="4" stroke-linecap="round"/>
  <path d="M23 86L19 81" stroke="#7A552E" stroke-width="3" stroke-linecap="round"/>
  <path d="M35 86L39 81" stroke="#7A552E" stroke-width="3" stroke-linecap="round"/>
${crate({ x: 82, y: 92, body: "#C29050", edge: "#855B31" })}
`),
  "foundry-overlay.svg": svg(`
${isoBase({ front: "#C9CDD3", side: "#939CA8", roof: "#915E34", x: 30, y: 100, w: 42, h: 28, depth: 22 })}
${chimney({ x: 80, y: 73 })}
${gear({ cx: 37, cy: 92, r: 7, fill: "#727B87" })}
  <path d="M88 89L100 79L107 85L95 95L88 89Z" fill="#E19D39"/>
  <path d="M98 70C94 64, 97 58, 102 54C105 60, 105 66, 101 71C100 72, 99 72, 98 70Z" fill="#F2B14A"/>
`),
  "garrison-hall-overlay.svg": svg(`
${isoBase({ front: "#D8D1C6", side: "#A7B0BB", roof: "#8A3F33", x: 34, y: 98, w: 40, h: 30, depth: 18 })}
${door({ x: 50, y: 88, w: 9, h: 14, fill: "#33404F" })}
${banner({ x: 31, y: 86, fill: "#C44937" })}
${banner({ x: 87, y: 84, fill: "#D1A64A" })}
  <path d="M97 95L105 87L113 95L105 103L97 95Z" fill="#BCC7D3"/>
`),
  "customs-house-overlay.svg": svg(`
${isoBase({ front: "#E7DAC6", side: "#A6AAA8", roof: "#C48B46", x: 34, y: 98, w: 40, h: 28, depth: 20 })}
${mast({ x: 88, y: 96, h: 32, sail: "#F3E2BE" })}
${barrel({ x: 20, y: 84, body: "#98683B" })}
${crate({ x: 84, y: 95, body: "#C08D4F", edge: "#815730" })}
${wave({ x: 12, y: 108 })}
`),
  "governors-office-overlay.svg": svg(`
${isoBase({ front: "#E4D8C8", side: "#AEB4BE", roof: "#B14B39", x: 30, y: 100, w: 46, h: 32, depth: 22 })}
${door({ x: 49, y: 90, w: 10, h: 15 })}
${windowRect({ x: 38, y: 82, w: 7, h: 7, fill: "#DDF3FF" })}
${windowRect({ x: 63, y: 82, w: 7, h: 7, fill: "#DDF3FF" })}
${banner({ x: 93, y: 87, fill: "#D1B15B" })}
  <path d="M42 61H66" stroke="#F0E0A0" stroke-width="4" stroke-linecap="round"/>
`),
  "radar-system-overlay.svg": svg(`
${isoBase({ front: "#D0D6DE", side: "#97A3B3", roof: "#6D737D", x: 32, y: 100, w: 40, h: 22, depth: 22 })}
${antenna({ x: 72, y: 73, h: 34 })}
  <path d="M72 37C81 37, 88 44, 88 53" stroke="#9FD8FF" stroke-width="3" stroke-linecap="round"/>
  <path d="M72 30C85 30, 96 41, 96 54" stroke="#69C2FF" stroke-width="3" stroke-linecap="round"/>
  <path d="M17 95L25 87L33 95L25 103L17 95Z" fill="#67C8FF"/>
`),
};

await mkdir(outDir, { recursive: true });
for (const [filename, contents] of Object.entries(files)) {
  await writeFile(path.join(outDir, filename), contents);
}

console.log(`Generated ${Object.keys(files).length} structure overlays in ${outDir}`);
