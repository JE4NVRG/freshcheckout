import { describe, expect, it, vi } from "vitest";

import { GitHubSourceResolver } from "../src/server/github-resolver.js";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("GitHubSourceResolver", () => {
  it("resolves the default branch to an immutable SHA", async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ default_branch: "main", size: 4_200 }))
      .mockResolvedValueOnce(jsonResponse({ sha: "A".repeat(40) }));
    const resolver = new GitHubSourceResolver(request);

    await expect(resolver.resolve("solari-sdk", "solari-cookbook")).resolves.toEqual({
      defaultBranch: "main",
      commitSha: "a".repeat(40),
      sizeKb: 4_200,
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1]?.[0]).toContain("/commits/main");
  });

  it("rejects repositories above the bounded size before resolving a commit", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      default_branch: "main",
      size: 200 * 1024 + 1,
    }));
    const resolver = new GitHubSourceResolver(request);

    await expect(resolver.resolve("owner", "huge-repo")).rejects.toMatchObject({
      code: "repository_too_large",
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("returns a stable rate-limit failure", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(
      { message: "rate limited" },
      403,
      { "x-ratelimit-remaining": "0" },
    ));
    const resolver = new GitHubSourceResolver(request);

    await expect(resolver.resolve("owner", "repo")).rejects.toMatchObject({
      code: "github_rate_limited",
    });
  });
});
