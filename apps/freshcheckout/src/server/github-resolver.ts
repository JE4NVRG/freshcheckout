import { z } from "zod";

import type { ResolvedSource } from "./runner-contract.js";

const MAX_REPOSITORY_SIZE_KB = 200 * 1024;

const repositoryResponseSchema = z.object({
  default_branch: z.string().min(1).max(255),
  size: z.number().int().nonnegative(),
});

const commitResponseSchema = z.object({
  sha: z.string().regex(/^[0-9a-f]{40}$/i),
});

export class GitHubSourceError extends Error {
  public constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "GitHubSourceError";
  }
}

export class GitHubSourceResolver {
  public constructor(private readonly request: typeof fetch = fetch) {}

  public async resolve(owner: string, repository: string): Promise<ResolvedSource> {
    const basePath = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;
    const metadata = repositoryResponseSchema.parse(await this.fetchJson(basePath));
    if (metadata.size > MAX_REPOSITORY_SIZE_KB) {
      throw new GitHubSourceError("repository_too_large", "Repository exceeds the 200 MiB verification limit.");
    }

    const commit = commitResponseSchema.parse(await this.fetchJson(
      `${basePath}/commits/${encodeURIComponent(metadata.default_branch)}`,
    ));

    return {
      defaultBranch: metadata.default_branch,
      commitSha: commit.sha.toLowerCase(),
      sizeKb: metadata.size,
    };
  }

  private async fetchJson(url: string): Promise<unknown> {
    const response = await this.request(url, {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "freshcheckout/0.1",
        "x-github-api-version": "2022-11-28",
      },
      signal: AbortSignal.timeout(12_000),
    });

    if (!response.ok) {
      const remaining = response.headers.get("x-ratelimit-remaining");
      if (response.status === 403 && remaining === "0") {
        throw new GitHubSourceError("github_rate_limited", "GitHub API rate limit reached. Try again later.");
      }
      if (response.status === 404) {
        throw new GitHubSourceError("repository_not_found", "Public GitHub repository was not found.");
      }
      throw new GitHubSourceError("github_unavailable", `GitHub API returned HTTP ${response.status}.`);
    }

    return response.json() as Promise<unknown>;
  }
}
