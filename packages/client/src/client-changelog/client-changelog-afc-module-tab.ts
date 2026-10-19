import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const AFC_MODULE_TAB_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1791753144590, // frozen Date.now() value for this release
    introducedIn: "2026.10.11.2",
    title: "Graphical AFC module sockets",
    why: "Managing modules across multiple AFCs needed a clear view of what each complex contains.",
    changes: ["A new Modules tab maps all eight sockets, including captured copies and incoming deliveries", "Empty sockets link to call-down controls for unlocked modules missing here, including your copies on other AFCs"]
  },
  {
    createdAt: 1791803239763, // frozen Date.now() value for this release
    introducedIn: "2026.10.12.1",
    title: "Choose AFC modules at an empty socket",
    why: "The permanent module list did not make it clear which empty socket you clicked.",
    changes: ["Module choices stay hidden until you click an empty socket, then appear beside that socket", "The picker highlights the selected socket, supports keyboard dismissal, and stays open through incoming-delivery countdown refreshes"]
  },
  {
    createdAt: 1792270126879, // Date.now() captured when this entry was written.
    introducedIn: "2026.10.17.3",
    title: "Industrial Tooling docks as a precision mill",
    why: "The Manufactory unlock deserves its own visible AFC machine.",
    changes: ["The Industrial Tooling Module now has a dedicated 3D milling gantry with a moving spindle, rotating drive wheel and tool rack", "The 2D map shows a matching gantry symbol on AFCs with tooling installed"]
  },
  {
    createdAt: 1792321229313, // Date.now() captured when this entry was written.
    introducedIn: "2026.10.18.2",
    title: "AFC menus open on their Modules tab",
    why: "The AFC Overview tab repeated the module list already shown by the socket diagram.",
    changes: ["The Modules tab replaces Overview on AFC tiles, with the remaining tile details and the Manage AFC upgrades button below the sockets", "The AFC button now opens your home AFC straight to its Modules tab"]
  },
  {
    createdAt: 1792430386654, // Date.now() captured when this entry was written.
    introducedIn: "2026.10.19.3",
    title: "AFC upgrades up front, tidier Modules tab",
    why: "AFC upgrades were buried under the socket diagram in a cramped button, and the diagram itself was too tall to fit in the tile menu.",
    changes: [
      "A large AFC upgrades button now sits at the top of your AFC's Modules tab, showing how many upgrades are ready",
      "The eight-socket diagram is compact enough to see whole without scrolling",
      "Empty sockets show just their number and a +, with one hint underneath when you can call down a module",
      "Shorter notes under the diagram; the incoming-module note only appears while a delivery is on its way"
    ]
  }
];
