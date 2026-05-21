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
  "fur-synthesizer-overlay.svg": svg(`
  <path d="M18 100L34 89H80L64 100H18Z" fill="#8B5E35"/>
  <path d="M34 89V68H80V89H34Z" fill="#CFC5B7"/>
  <path d="M80 89L98 77V56L80 68V89Z" fill="#9B948A"/>
  <path d="M34 68L52 56H98L80 68H34Z" fill="#7A5B42"/>

  <path d="M76 67V49H84V67H76Z" fill="#7A828D"/>
  <path d="M77 49L81 45H87L83 49H77Z" fill="#B2BAC3"/>
  <path d="M88 60V42H96V60H88Z" fill="#6D7681"/>
  <path d="M89 42L93 38H99L95 42H89Z" fill="#AAB2BC"/>

  <path d="M46 68H66" stroke="#8A6A45" stroke-width="4" stroke-linecap="round"/>
  <path d="M56 68V82" stroke="#8A6A45" stroke-width="4" stroke-linecap="round"/>
  <circle cx="56" cy="75" r="6" fill="#9A7E55"/>
  <circle cx="56" cy="75" r="2.2" fill="#D9D1C1"/>

  <path d="M22 83L27 88L26 97L22 103L18 97L17 88L22 83Z" fill="#8A613D"/>
  <path d="M33 88L38 93L37 102L33 108L29 102L28 93L33 88Z" fill="#A37751"/>

  <ellipse cx="92" cy="85" rx="6" ry="3.5" fill="#D0A05F"/>
  <path d="M86 85C87 96, 97 96, 98 85V97C97 104, 87 104, 86 97V85Z" fill="#8B5D34"/>
  <path d="M87 92H97" stroke="#505A67" stroke-width="2"/>
  <path d="M87 98H97" stroke="#505A67" stroke-width="2"/>

  <path d="M59 59L68 50L77 59L68 68L59 59Z" fill="#D5B05C"/>
  <path d="M68 50V68" stroke="#8E6B2E" stroke-width="2"/>
  <path d="M82 45C85 40, 92 40, 94 45" stroke="#C4C9CF" stroke-width="3" stroke-linecap="round"/>
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
  "exchange-house-overlay.svg": svg(`
${isoBase({ front: "#E6D9C8", side: "#A7B0BB", roof: "#B77238", x: 32, y: 98, w: 42, h: 28, depth: 20 })}
${door({ x: 48, y: 88, w: 9, h: 13, fill: "#38485B" })}
${windowRect({ x: 37, y: 80, w: 7, h: 7, fill: "#F6EAB8" })}
${windowRect({ x: 63, y: 80, w: 7, h: 7, fill: "#F6EAB8" })}
${coinStack({ x: 20, y: 84 })}
${coinStack({ x: 88, y: 88 })}
  <path d="M82 68C88 62, 97 62, 102 68" stroke="#F0D37A" stroke-width="4" stroke-linecap="round"/>
  <path d="M82 72H102" stroke="#D39F3C" stroke-width="3" stroke-linecap="round"/>
`),
  "governors-office-overlay.svg": svg(`
${isoBase({ front: "#E4D8C8", side: "#AEB4BE", roof: "#B14B39", x: 30, y: 100, w: 46, h: 32, depth: 22 })}
${door({ x: 49, y: 90, w: 10, h: 15 })}
${windowRect({ x: 38, y: 82, w: 7, h: 7, fill: "#DDF3FF" })}
${windowRect({ x: 63, y: 82, w: 7, h: 7, fill: "#DDF3FF" })}
${banner({ x: 93, y: 87, fill: "#D1B15B" })}
  <path d="M42 61H66" stroke="#F0E0A0" stroke-width="4" stroke-linecap="round"/>
`),
  "imperial-exchange-overlay.svg": svg(`
  <path d="M10 106L34 92H98L74 106H10Z" fill="#87623C"/>
  <path d="M34 92V84H98V92H34Z" fill="#D8CAB3"/>
  <path d="M98 92L118 82V74L98 84V92Z" fill="#A4ADB7"/>
  <path d="M34 84L54 74H118L98 84H34Z" fill="#B78648"/>

  <path d="M24 92L42 81H92L74 92H24Z" fill="#E7DCC8"/>
  <path d="M42 81V60H92V81H42Z" fill="#EFE5D4"/>
  <path d="M92 81L108 72V51L92 60V81Z" fill="#B0B8C3"/>
  <path d="M42 60L60 50H108L92 60H42Z" fill="#C99550"/>

  <path d="M34 74L43 68H51L42 74H34Z" fill="#C9B08C"/>
  <path d="M49 74L58 68H66L57 74H49Z" fill="#C9B08C"/>
  <path d="M64 74L73 68H81L72 74H64Z" fill="#C9B08C"/>
  <path d="M79 74L88 68H96L87 74H79Z" fill="#C9B08C"/>

  <path d="M54 60V42H80V60H54Z" fill="#F2E7D7"/>
  <path d="M80 60L92 53V35L80 42V60Z" fill="#B6BFCA"/>
  <path d="M54 42L66 35H92L80 42H54Z" fill="#AA4D38"/>
  <path d="M50 42C55 28, 67 22, 78 26C86 29, 90 35, 92 42H50Z" fill="#D0A552"/>
  <path d="M60 44C64 35, 74 34, 79 44" stroke="#FFF1C2" stroke-width="3" stroke-linecap="round"/>

  <path d="M23 81V55H31V81H23Z" fill="#DCCBAF"/>
  <path d="M31 81L38 76V50L31 55V81Z" fill="#98A3AF"/>
  <path d="M23 55L31 50H38L31 55H23Z" fill="#B38A55"/>
  <path d="M31 55V33" stroke="#E8D59D" stroke-width="3" stroke-linecap="round"/>
  <circle cx="31" cy="30" r="4" fill="#F4E3A5"/>

  <path d="M93 81V55H101V81H93Z" fill="#DCCBAF"/>
  <path d="M101 81L108 76V50L101 55V81Z" fill="#98A3AF"/>
  <path d="M93 55L101 50H108L101 55H93Z" fill="#B38A55"/>
  <path d="M101 55V33" stroke="#E8D59D" stroke-width="3" stroke-linecap="round"/>
  <circle cx="101" cy="30" r="4" fill="#F4E3A5"/>

  <path d="M58 74H76" stroke="#A37C44" stroke-width="4" stroke-linecap="round"/>
  <path d="M64 74V92" stroke="#35475A" stroke-width="3" stroke-linecap="round"/>
  <path d="M20 88C34 80, 53 79, 68 84" stroke="#F0DB93" stroke-width="4" stroke-linecap="round"/>
  <path d="M69 84C81 88, 95 87, 108 80" stroke="#F0DB93" stroke-width="4" stroke-linecap="round"/>
  <circle cx="18" cy="88" r="6" fill="#D8A53D"/>
  <circle cx="113" cy="80" r="6" fill="#D8A53D"/>
`),
  "radar-system-overlay.svg": svg(`
${isoBase({ front: "#D0D6DE", side: "#97A3B3", roof: "#6D737D", x: 32, y: 100, w: 40, h: 22, depth: 22 })}
${antenna({ x: 72, y: 73, h: 34 })}
  <path d="M72 37C81 37, 88 44, 88 53" stroke="#9FD8FF" stroke-width="3" stroke-linecap="round"/>
  <path d="M72 30C85 30, 96 41, 96 54" stroke="#69C2FF" stroke-width="3" stroke-linecap="round"/>
  <path d="M17 95L25 87L33 95L25 103L17 95Z" fill="#67C8FF"/>
`),
  "rail-depot-overlay.svg": svg(`
${isoBase({ front: "#D7DCE3", side: "#9DA7B5", roof: "#B87539", x: 30, y: 100, w: 44, h: 26, depth: 22 })}
${banner({ x: 92, y: 90, fill: "#D09A3A" })}
  <path d="M18 101H55" stroke="#5C6672" stroke-width="4" stroke-linecap="round"/>
  <path d="M18 107H55" stroke="#5C6672" stroke-width="4" stroke-linecap="round"/>
  <path d="M24 101V107M32 101V107M40 101V107M48 101V107" stroke="#8E6236" stroke-width="3" stroke-linecap="round"/>
  <path d="M78 88L89 82H102L91 88H78Z" fill="#C48E4E"/>
  <path d="M89 82V74H102V82H89Z" fill="#D5DEE8"/>
  <path d="M102 82L111 77V69L102 74V82Z" fill="#8A95A3"/>
  <circle cx="90" cy="90" r="4" fill="#314255"/>
  <circle cx="101" cy="90" r="4" fill="#314255"/>
  <path d="M42 72H66" stroke="#6E7D8F" stroke-width="3" stroke-linecap="round"/>
`),
  "aegis-dome-overlay.svg": svg(`
  <path d="M10 106L36 91H104L78 106H10Z" fill="#6E7480"/>
  <path d="M36 91V82H104V91H36Z" fill="#C9D4DF"/>
  <path d="M104 91L118 83V74L104 82V91Z" fill="#8D9CAE"/>
  <path d="M36 82L50 74H118L104 82H36Z" fill="#7A8595"/>

  <path d="M25 96C31 66, 54 44, 81 44C100 44, 113 57, 115 74" stroke="#A8E9FF" stroke-width="5" stroke-linecap="round"/>
  <path d="M31 96C36 72, 56 56, 79 56C94 56, 104 64, 108 79" stroke="#72CFF5" stroke-width="4" stroke-linecap="round"/>
  <path d="M24 96C28 71, 49 51, 76 49C95 48, 109 58, 116 74" fill="none" stroke="#DFFBFF" stroke-width="2.5" stroke-linecap="round" opacity="0.9"/>

  <path d="M32 88C32 66, 46 50, 66 50C84 50, 97 62, 99 80L32 88Z" fill="#D9F4FF" opacity="0.82"/>
  <path d="M32 88C34 67, 48 54, 66 54C82 54, 93 63, 96 78" fill="none" stroke="#F2FEFF" stroke-width="2.5" stroke-linecap="round"/>

  <path d="M24 94V72H31V94H24Z" fill="#97A6B8"/>
  <path d="M31 94L38 90V68L31 72V94Z" fill="#647489"/>
  <path d="M24 72L31 68H38L31 72H24Z" fill="#BFD3E3"/>
  <path d="M95 94V72H102V94H95Z" fill="#97A6B8"/>
  <path d="M102 94L109 90V68L102 72V94Z" fill="#647489"/>
  <path d="M95 72L102 68H109L102 72H95Z" fill="#BFD3E3"/>

  <path d="M55 82V64H70V82H55Z" fill="#E9F8FF"/>
  <path d="M70 82L81 76V58L70 64V82Z" fill="#99AFC5"/>
  <path d="M55 64L66 58H81L70 64H55Z" fill="#BFD9F0"/>
  <path d="M62 62V49" stroke="#9AE4FF" stroke-width="3" stroke-linecap="round"/>
  <circle cx="62" cy="46" r="4" fill="#CFFFFF"/>
  <path d="M48 101C56 94, 70 94, 78 101" stroke="#A9E7FF" stroke-width="4" stroke-linecap="round"/>
`),
  "astral-dock-overlay.svg": svg(`
  <path d="M8 106L34 91H100L74 106H8Z" fill="#646B78"/>
  <path d="M34 91V82H100V91H34Z" fill="#C8D1DB"/>
  <path d="M100 91L118 81V72L100 82V91Z" fill="#8895A6"/>
  <path d="M34 82L52 72H118L100 82H34Z" fill="#738093"/>

  <path d="M26 92V55H34V92H26Z" fill="#A8B6C6"/>
  <path d="M34 92L42 87V50L34 55V92Z" fill="#6C7B8F"/>
  <path d="M26 55L34 50H42L34 55H26Z" fill="#D4E1F0"/>
  <path d="M42 86L55 78" stroke="#8BCBFF" stroke-width="3" stroke-linecap="round"/>
  <path d="M42 76L56 68" stroke="#8BCBFF" stroke-width="3" stroke-linecap="round"/>

  <path d="M74 84L92 73L107 81L89 92L74 84Z" fill="#D9EAF6"/>
  <path d="M89 92V74" stroke="#5A6D84" stroke-width="3" stroke-linecap="round"/>
  <path d="M88 74L101 66" stroke="#5A6D84" stroke-width="3" stroke-linecap="round"/>
  <circle cx="101" cy="66" r="7" fill="#A6E7FF"/>
  <circle cx="101" cy="66" r="3.5" fill="#EFFFFF"/>

  <path d="M48 82V47H60V82H48Z" fill="#D7DFE8"/>
  <path d="M60 82L70 76V41L60 47V82Z" fill="#98A5B7"/>
  <path d="M48 47L60 41H70L60 47H48Z" fill="#C18A48"/>
  <path d="M57 47V26" stroke="#9EDBFF" stroke-width="4" stroke-linecap="round"/>
  <path d="M49 35L57 26L66 35" stroke="#E8FBFF" stroke-width="3" stroke-linecap="round"/>
  <path d="M42 60H49M42 69H49M42 78H49" stroke="#87A0B9" stroke-width="3" stroke-linecap="round"/>

  <path d="M70 38C81 32, 96 36, 102 48" stroke="#8FD7FF" stroke-width="4" stroke-linecap="round"/>
  <path d="M74 31C87 24, 104 28, 111 43" stroke="#D6F6FF" stroke-width="3" stroke-linecap="round"/>
  <path d="M18 101C29 94, 44 94, 55 101" stroke="#7ACBFF" stroke-width="4" stroke-linecap="round"/>
`),
  "world-engine-overlay.svg": svg(`
  <path d="M6 108L38 90H100L68 108H6Z" fill="#5F554A"/>
  <path d="M38 90V79H100V90H38Z" fill="#C8D0DB"/>
  <path d="M100 90L121 78V67L100 79V90Z" fill="#8291A3"/>
  <path d="M38 79L59 67H121L100 79H38Z" fill="#7F6851"/>

  <path d="M24 91L40 81H62L46 91H24Z" fill="#8F9BA9"/>
  <path d="M40 81V68H62V81H40Z" fill="#D8E0EA"/>
  <path d="M62 81L76 73V60L62 68V81Z" fill="#7E8C9C"/>
  <path d="M40 68L54 60H76L62 68H40Z" fill="#687483"/>
  <circle cx="50" cy="75" r="6" fill="#344658"/>
  <circle cx="50" cy="75" r="2.5" fill="#A8DFFF"/>

  <path d="M58 72L84 57L111 72L85 87L58 72Z" fill="#E3EBF5"/>
  <path d="M85 87V65" stroke="#556779" stroke-width="4" stroke-linecap="round"/>
  <path d="M58 72L44 79" stroke="#556779" stroke-width="5" stroke-linecap="round"/>
  <path d="M85 65L101 55" stroke="#556779" stroke-width="5" stroke-linecap="round"/>
  <path d="M96 54L110 46L120 51L106 59L96 54Z" fill="#9AD8FF"/>

  <path d="M86 63L107 51L121 59L100 71L86 63Z" fill="#C8F1FF"/>
  <path d="M100 71L113 79" stroke="#5A6E82" stroke-width="4" stroke-linecap="round"/>
  <circle cx="112" cy="79" r="6" fill="#2D4156"/>
  <circle cx="112" cy="79" r="2.5" fill="#DBF8FF"/>

  <path d="M54 67V40H66V67H54Z" fill="#A0AEBD"/>
  <path d="M66 67L75 62V35L66 40V67Z" fill="#718094"/>
  <path d="M54 40L66 35H75L66 40H54Z" fill="#D6E3F0"/>
  <path d="M60 39V20" stroke="#8CD8FF" stroke-width="4" stroke-linecap="round"/>
  <circle cx="60" cy="17" r="4" fill="#DFF7FF"/>

  <path d="M93 48L117 34" stroke="#77CFFF" stroke-width="4" stroke-linecap="round"/>
  <path d="M101 45L120 30" stroke="#D6F8FF" stroke-width="3" stroke-linecap="round"/>
  <path d="M112 34L121 28" stroke="#EFFDFF" stroke-width="2.5" stroke-linecap="round"/>

  <path d="M18 103C29 95, 46 95, 57 103" stroke="#C89249" stroke-width="4" stroke-linecap="round"/>
  <path d="M74 98C81 92, 94 91, 103 96" stroke="#A0D8FF" stroke-width="3" stroke-linecap="round"/>
`),
};

await mkdir(outDir, { recursive: true });
for (const [filename, contents] of Object.entries(files)) {
  await writeFile(path.join(outDir, filename), contents);
}

console.log(`Generated ${Object.keys(files).length} structure overlays in ${outDir}`);
