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
  }
];
