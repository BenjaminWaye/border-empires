import { describe, expect, it, vi } from "vitest";

import { createAdminAuthorizer, createGithubAdminAccessChecker } from "./admin-auth.js";

const jsonResponse = (body: unknown, ok = true): Response =>
  ({ ok, json: async () => body } as unknown as Response);

describe("createAdminAuthorizer", () => {
  it("authorizes the static token via Authorization header", async () => {
    const { adminRequestAuthorized } = createAdminAuthorizer({ adminApiToken: "secret" });
    await expect(
      adminRequestAuthorized({ headers: { authorization: "Bearer secret" } })
    ).resolves.toBe(true);
  });

  it("authorizes the static token via ?token= query fallback", async () => {
    const { adminRequestAuthorized } = createAdminAuthorizer({ adminApiToken: "secret" });
    await expect(
      adminRequestAuthorized({ headers: {}, query: { token: "secret" } })
    ).resolves.toBe(true);
  });

  it("rejects when no token matches and no GitHub auth is configured", async () => {
    const { adminRequestAuthorized } = createAdminAuthorizer({ adminApiToken: "secret" });
    await expect(
      adminRequestAuthorized({ headers: { authorization: "Bearer wrong" } })
    ).resolves.toBe(false);
  });

  it("adminAuthorized (static-only) ignores GitHub config entirely", () => {
    const { adminAuthorized } = createAdminAuthorizer({
      adminApiToken: "secret",
      githubAuth: { repoOwner: "acme", repoName: "widgets" }
    });
    expect(adminAuthorized("Bearer secret")).toBe(true);
    expect(adminAuthorized(undefined)).toBe(false);
  });

  it("authorizes via a valid X-Admin-Github-Token with read+ repo permission", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ login: "octocat" }))
      .mockResolvedValueOnce(jsonResponse({ permission: "write" }));
    const { adminRequestAuthorized } = createAdminAuthorizer({
      githubAuth: { repoOwner: "acme", repoName: "widgets" },
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    await expect(
      adminRequestAuthorized({ headers: { "x-admin-github-token": "gh-token" } })
    ).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("rejects a GitHub token with no repo permission", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ login: "mallory" }))
      .mockResolvedValueOnce(jsonResponse({ permission: "none" }));
    const { adminRequestAuthorized } = createAdminAuthorizer({
      githubAuth: { repoOwner: "acme", repoName: "widgets" },
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    await expect(
      adminRequestAuthorized({ headers: { "x-admin-github-token": "gh-token" } })
    ).resolves.toBe(false);
  });

  it("rejects a GitHub token that fails /user lookup", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({}, false));
    const { adminRequestAuthorized } = createAdminAuthorizer({
      githubAuth: { repoOwner: "acme", repoName: "widgets" },
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    await expect(
      adminRequestAuthorized({ headers: { "x-admin-github-token": "gh-token" } })
    ).resolves.toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("createGithubAdminAccessChecker", () => {
  it("caches a result so a repeat check does not re-hit the GitHub API", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ login: "octocat" }))
      .mockResolvedValueOnce(jsonResponse({ permission: "read" }));
    const checkAccess = createGithubAdminAccessChecker(
      { repoOwner: "acme", repoName: "widgets" },
      fetchImpl as unknown as typeof fetch
    );

    await expect(checkAccess("gh-token")).resolves.toBe(true);
    await expect(checkAccess("gh-token")).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("treats a network error as denied, not a thrown exception", async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new Error("network down"));
    const checkAccess = createGithubAdminAccessChecker(
      { repoOwner: "acme", repoName: "widgets" },
      fetchImpl as unknown as typeof fetch
    );

    await expect(checkAccess("gh-token")).resolves.toBe(false);
  });
});
