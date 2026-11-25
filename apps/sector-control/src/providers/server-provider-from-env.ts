// Builds the server provider the settings ask for.
import { createPublicKey } from "node:crypto";

import type { ServerProviderEnv } from "../runtime-env/server-provider-env.js";
import { FakeServerProvider } from "./fake-providers.js";
import { createHetznerApi } from "./hetzner/hetzner-api.js";
import { createHetznerServerProvider } from "./hetzner/hetzner-server-provider.js";
import type { ServerProvider } from "./providers.js";

/** The public half of the ticket key, in the form sector servers read (base64 of the SPKI DER). */
export const ticketPublicKeyFromPrivate = (privateKeyPem: string): string =>
  createPublicKey(privateKeyPem).export({ type: "spki", format: "der" }).toString("base64");

/** The git sha production runs, from a URL that answers with it as plain text. */
export const releaseShaFrom = (url: string, fetchImpl: (url: string) => Promise<{ status: number; text: () => Promise<string> }> = (u) => fetch(u, { signal: AbortSignal.timeout(10_000) })) =>
  async (): Promise<string> => {
    const response = await fetchImpl(url);
    const sha = (await response.text()).trim();
    if (response.status !== 200 || !/^[0-9a-f]{40}$/.test(sha)) throw new Error(`${url} did not answer with a release sha`);
    return sha;
  };

export const serverProviderFromEnv = (env: ServerProviderEnv, ticketPrivateKeyPem: string): ServerProvider => {
  if (env.kind === "fake") return new FakeServerProvider();
  return createHetznerServerProvider(createHetznerApi({ token: env.apiToken }), {
    dnsZone: env.dnsZone,
    serverType: env.serverType,
    location: env.location,
    image: env.image,
    ...(env.firewallId !== undefined ? { firewallId: env.firewallId } : {}),
    githubRepo: env.githubRepo,
    sectorAdminSecret: env.sectorAdminSecret,
    ticketPublicKey: ticketPublicKeyFromPrivate(ticketPrivateKeyPem),
    releaseSha: releaseShaFrom(env.releaseUrl)
  });
};
