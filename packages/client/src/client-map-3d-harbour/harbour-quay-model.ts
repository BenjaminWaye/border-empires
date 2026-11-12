// The harbour quay on a dock tile, facing +z (the sea), paving at y = 0.085
// (client-wreck-models/dock-fire-model.ts QUAY_DECK_Y burns on this layout):
// control office back-left, gantry crane and cell bank back-right, containers
// mid-quay, the pier front-right and an armoured troop carrier front-left.
import type { HarbourModelBuilder } from "./harbour-model-builder.js";
import { cargoContainer, drumPallet, lampPost, sensorMast } from "./harbour-props.js";

const DECK = 0.085;

const plinth = (b: HarbourModelBuilder): void => {
  // Stepped marble plinth like the structures' platforms: a charcoal foot and
  // course, a brass inlay, a black-and-gold top with brass lines set into it.
  b.box("charcoalMarble", 0, 0.008, -0.12, 0.93, 0.016, 0.67);
  b.box("charcoalMarble", 0, 0.035, -0.12, 0.9, 0.054, 0.64);
  b.box("brass", 0, 0.066, -0.12, 0.886, 0.008, 0.626);
  b.box("blackMarble", 0, 0.0775, -0.12, 0.862, 0.015, 0.602);
  for (const [x, z, w, d] of [[0, 0.155, 0.8, 0.006], [0, -0.395, 0.8, 0.006], [-0.4, -0.12, 0.006, 0.556], [0.4, -0.12, 0.006, 0.556]] as const) {
    b.box("brass", x, DECK + 0.001, z, w, 0.002, d);
  }
  for (const x of [-0.45, 0.45]) for (const z of [-0.445, 0.205]) b.box("brassDark", x, 0.035, z, 0.03, 0.058, 0.03);
  // Iron sea edge with rubber fenders along the quay face.
  b.box("iron", 0, 0.09, 0.185, 0.88, 0.02, 0.035);
  for (const x of [-0.4, -0.04, 0.3, 0.4]) b.box("ironDark", x, 0.05, 0.207, 0.045, 0.05, 0.012);
};

const controlOffice = (b: HarbourModelBuilder): void => {
  const x = -0.24, z = -0.24;
  b.box("charcoalMarble", x, DECK + 0.008, z, 0.3, 0.016, 0.26);
  b.box("stone", x, 0.205, z, 0.28, 0.2, 0.24);
  for (const dx of [-0.14, 0.14]) for (const dz of [-0.12, 0.12]) b.box("plate", x + dx, 0.205, z + dz, 0.034, 0.2, 0.034);
  // Front: an iron door in a brass frame, a lit window band with brass mullions, the toll board.
  b.box("ironDark", x, 0.165, -0.117, 0.06, 0.11, 0.01);
  b.box("brassDark", x, 0.224, -0.115, 0.078, 0.01, 0.012);
  for (const dx of [-0.034, 0.034]) b.box("brassDark", x + dx, 0.165, -0.115, 0.01, 0.12, 0.012);
  b.box("charcoalMarble", x, DECK + 0.005, -0.1, 0.09, 0.01, 0.03);
  for (const dx of [-0.085, 0.085]) {
    b.box("lampGlow", x + dx, 0.2, -0.1175, 0.07, 0.07, 0.006);
    b.box("brassDark", x + dx, 0.2, -0.114, 0.006, 0.074, 0.008);
    b.box("brassDark", x + dx, 0.2, -0.114, 0.074, 0.006, 0.008);
  }
  b.box("lampGlow", x, 0.27, -0.1175, 0.24, 0.032, 0.006);
  for (let i = -2; i <= 2; i += 1) b.box("brassDark", x + i * 0.05, 0.27, -0.114, 0.006, 0.036, 0.008);
  b.box("brass", x, 0.296, -0.115, 0.15, 0.012, 0.008);
  // Cool glazing down both sides.
  for (const side of [-1, 1]) b.box("glass", x + side * 0.1405, 0.25, z, 0.006, 0.06, 0.17);
  // Brass cornice, iron roof, a plant housing and the harbour sensor mast.
  b.box("brassDark", x, 0.312, z, 0.3, 0.014, 0.26);
  b.box("iron", x, 0.326, z, 0.27, 0.014, 0.23);
  b.box("plate", x + 0.06, 0.35, z - 0.03, 0.08, 0.034, 0.08);
  for (const dz of [-0.02, 0, 0.02]) b.box("ironDark", x + 0.06, 0.35, z - 0.03 + dz, 0.082, 0.026, 0.004);
  b.cylinder("ironDark", x + 0.06, 0.37, z - 0.03, 0.025, 0.008);
  sensorMast(b, x - 0.09, 0.333, z - 0.07, 0.2);
};

const gantryCrane = (b: HarbourModelBuilder): void => {
  const x = 0.2;
  for (const z of [-0.33, 0.12]) {
    b.box("brassDark", x, DECK + 0.01, z, 0.075, 0.02, 0.075);
    b.box("iron", x, 0.3, z, 0.045, 0.41, 0.045);
    for (const side of [-1, 1]) b.box("status", x + side * 0.0235, 0.3, z, 0.003, 0.3, 0.014);
    b.box("brassDark", x, 0.5, z, 0.06, 0.018, 0.06);
  }
  // X-bracing between the legs, in the crane's own plane.
  b.rod("ironDark", [x, 0.13, -0.31], [x, 0.47, 0.1], 0.007);
  b.rod("ironDark", [x, 0.47, -0.31], [x, 0.13, 0.1], 0.007);
  // Box-girder beam out over the pier: brass-striped top, running rail beneath, sea-end light.
  b.box("iron", x, 0.53, 0.07, 0.06, 0.044, 0.92);
  b.box("brass", x, 0.553, 0.07, 0.062, 0.004, 0.92);
  b.box("ironDark", x, 0.503, 0.13, 0.026, 0.01, 0.78);
  for (let z = -0.34; z <= 0.5; z += 0.12) b.box("brassDark", x, 0.53, z, 0.064, 0.046, 0.006);
  b.box("brassDark", x, 0.53, 0.532, 0.066, 0.05, 0.008);
  b.cylinder("status", x, 0.562, 0.52, 0.009, 0.014);
  // Counterweight on the landward end, and the operator's cab under the beam.
  b.box("plate", x, 0.49, -0.37, 0.09, 0.07, 0.07);
  for (const dy of [-0.02, 0.02]) b.box("brassDark", x, 0.49 + dy, -0.37, 0.094, 0.006, 0.074);
  b.box("stone", x, 0.46, -0.18, 0.07, 0.06, 0.08);
  b.box("glass", x, 0.462, -0.138, 0.06, 0.036, 0.004);
  b.box("lampGlow", x + 0.0355, 0.462, -0.18, 0.003, 0.03, 0.05);
  b.box("iron", x, 0.493, -0.18, 0.074, 0.008, 0.084);
  // Trolley, twin hoist lines, spreader and a container on the hook.
  b.box("brass", x, 0.488, 0.34, 0.08, 0.026, 0.08);
  for (const dz of [-0.03, 0.03]) b.cylinder("ironDark", x, 0.49, 0.34 + dz, 0.012, 0.09, [0, 0, Math.PI / 2]);
  for (const dx of [-0.02, 0.02]) b.rod("ironDark", [x + dx, 0.475, 0.34], [x + dx, 0.34, 0.34], 0.0035);
  b.box("ironDark", x, 0.335, 0.34, 0.09, 0.01, 0.155);
  cargoContainer(b, x, 0.29, 0.34, 0.08, 0.07, 0.14, Math.PI / 2, false);
};

const cellBank = (b: HarbourModelBuilder): void => {
  b.box("brassDark", 0.38, DECK + 0.006, -0.16, 0.17, 0.012, 0.19);
  for (const [x, z, r, h] of [[0.36, -0.2, 0.05, 0.15], [0.42, -0.1, 0.032, 0.1]] as const) {
    const bottom = DECK + 0.012;
    b.cylinder("ironDark", x, bottom + h / 2, z, r, h);
    for (const at of [0.25, 0.75]) b.ring("brass", x, bottom + h * at, z, r + 0.002, 0.004);
    b.cylinder("status", x, bottom + h + 0.004, z, r * 0.75, 0.008);
    b.dome("iron", x, bottom + h + 0.008, z, r * 0.55);
    b.box("status", x + r + 0.001, bottom + h * 0.5, z, 0.003, h * 0.5, 0.01);
  }
  // Conduit to the crane's landward leg.
  b.rod("brassDark", [0.33, 0.1, -0.22], [0.225, 0.1, -0.31], 0.006);
};

const freight = (b: HarbourModelBuilder): void => {
  cargoContainer(b, -0.02, DECK + 0.05, -0.03, 0.16, 0.1, 0.09, 0, false);
  cargoContainer(b, 0.02, DECK + 0.05, 0.075, 0.16, 0.1, 0.09, 0, true);
  cargoContainer(b, 0.0, DECK + 0.15, 0.02, 0.15, 0.1, 0.09, 0.1, false);
  drumPallet(b, -0.15, 0.06);
};

const pier = (b: HarbourModelBuilder): void => {
  b.box("plate", 0.06, 0.075, 0.37, 0.3, 0.03, 0.4);
  for (const z of [0.25, 0.33, 0.41, 0.49]) b.box("ironDark", 0.06, 0.0905, z, 0.3, 0.002, 0.004);
  for (const x of [-0.09, 0.21]) b.box("brassDark", x, 0.08, 0.37, 0.012, 0.024, 0.4);
  b.box("brassDark", 0.06, 0.13, 0.565, 0.3, 0.008, 0.008);
  for (const x of [-0.08, 0.02, 0.12]) b.rod("ironDark", [x, 0.09, 0.565], [x, 0.13, 0.565], 0.004);
  for (const x of [-0.06, 0.18]) {
    for (const z of [0.25, 0.39, 0.53]) {
      b.cylinder("ironDark", x, -0.04, z, 0.022, 0.24);
      b.ring("brass", x, 0.03, z, 0.023, 0.004);
    }
    b.rod("iron", [x, -0.1, 0.27], [x, 0.05, 0.51], 0.005);
  }
  for (const z of [0.33, 0.45]) {
    b.cylinder("ironDark", -0.065, 0.105, z, 0.012, 0.03);
    b.cylinder("brass", -0.065, 0.122, z, 0.016, 0.005);
  }
  // Pier-head beacon for the sea lane.
  b.cylinder("iron", 0.19, 0.22, 0.54, 0.012, 0.26);
  b.ring("brass", 0.19, 0.33, 0.54, 0.014, 0.004);
  b.cylinder("ironDark", 0.19, 0.36, 0.54, 0.025, 0.03);
  b.cylinder("lampGlow", 0.19, 0.39, 0.54, 0.019, 0.03);
  for (const a of [0, Math.PI / 2]) b.box("ironDark", 0.19, 0.39, 0.54, 0.042, 0.03, 0.004, [0, a, 0]);
  b.dome("iron", 0.19, 0.405, 0.54, 0.027);
};

const troopCarrier = (b: HarbourModelBuilder): void => {
  // Armoured troop carrier (world bible §11) moored alongside, bow to the sea.
  b.frame(-0.19, 0, 0.37, 0, () => {
    b.box("hull", 0, -0.005, 0, 0.15, 0.07, 0.32);
    for (const side of [-1, 1]) b.box("hull", side * 0.07, 0.035, 0, 0.02, 0.06, 0.31, [0, 0, -side * 0.35]);
    b.box("brass", 0, 0.012, 0, 0.165, 0.008, 0.326);
    b.box("hull", 0, 0.02, 0.19, 0.15, 0.08, 0.016, [-0.45, 0, 0]);
    b.box("brassDark", 0, 0.055, 0.18, 0.15, 0.008, 0.012);
    b.box("plate", 0, 0.04, -0.01, 0.12, 0.01, 0.3);
    b.box("ironDark", 0, 0.047, 0.06, 0.09, 0.006, 0.13);
    for (const dz of [0.02, 0.06, 0.1]) b.box("brassDark", 0, 0.051, dz, 0.092, 0.002, 0.004);
    // Bridge aft: lit screen, brass trim, mast with radar dish, twin exhausts.
    b.box("stone", 0, 0.08, -0.1, 0.11, 0.07, 0.09);
    b.box("plate", 0, 0.13, -0.105, 0.09, 0.03, 0.07);
    b.box("lampGlow", 0, 0.133, -0.069, 0.08, 0.012, 0.004);
    b.box("glass", 0, 0.1, -0.054, 0.09, 0.02, 0.004);
    b.box("brassDark", 0, 0.147, -0.105, 0.094, 0.004, 0.074);
    sensorMast(b, 0, 0.149, -0.11, 0.11);
    for (const dx of [-0.025, 0.025]) {
      b.cylinder("ironDark", dx, 0.165, -0.14, 0.012, 0.05);
      b.ring("brass", dx, 0.19, -0.14, 0.012, 0.003);
    }
  });
  // Gangway from the quay edge to the carrier's deck.
  b.box("plate", -0.07, 0.07, 0.4, 0.1, 0.008, 0.05);
  for (const dz of [-0.022, 0.022]) b.rod("brassDark", [-0.115, 0.1, 0.4 + dz], [-0.025, 0.1, 0.4 + dz], 0.003);
};

export const buildQuay = (b: HarbourModelBuilder): void => {
  plinth(b);
  controlOffice(b);
  gantryCrane(b);
  cellBank(b);
  freight(b);
  pier(b);
  troopCarrier(b);
  lampPost(b, -0.37, DECK, 0.15);
  lampPost(b, 0.37, DECK, 0.15);
  lampPost(b, -0.04, DECK, -0.4);
};
