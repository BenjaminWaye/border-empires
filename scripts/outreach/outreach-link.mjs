#!/usr/bin/env node
// Prints a tagged play link for one outreach post, so its visitors and
// sign-ups show up as their own row on /admin/players/insights ("By source").
//
// Usage:
//   node scripts/outreach/outreach-link.mjs --source reddit --campaign "r/WebGames season 12 launch"
//   node scripts/outreach/outreach-link.mjs --source discord --medium announcement --campaign "season-12"
import { parseArgs } from "node:util";

import { buildOutreachLink } from "./outreach-lib.mjs";

const { values } = parseArgs({
  options: {
    source: { type: "string" },
    medium: { type: "string", default: "post" },
    campaign: { type: "string" },
    base: { type: "string" }
  }
});

try {
  console.log(buildOutreachLink({ source: values.source, medium: values.medium, campaign: values.campaign, ...(values.base ? { base: values.base } : {}) }));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
