import { describe, expect, it } from "vitest";

import { canonicalizeGitHubRepository, RepositoryUrlError } from "../src/core/github-url.js";

describe("canonicalizeGitHubRepository", () => {
  it.each([
    ["https://github.com/solari-sdk/solari-cookbook", "https://github.com/solari-sdk/solari-cookbook"],
    ["https://github.com/solari-sdk/solari-cookbook/", "https://github.com/solari-sdk/solari-cookbook"],
    ["https://github.com/solari-sdk/solari-cookbook.git", "https://github.com/solari-sdk/solari-cookbook"],
  ])("canonicalizes %s", (input, expected) => {
    expect(canonicalizeGitHubRepository(input).canonicalUrl).toBe(expected);
  });

  it.each([
    "http://github.com/owner/repo",
    "https://github.example.com/owner/repo",
    "https://user:pass@github.com/owner/repo",
    "https://github.com/owner/repo/issues",
    "https://github.com/owner/repo?tab=readme",
    "https://github.com/owner/repo#readme",
    "https://github.com/owner%2Frepo/extra",
    "https://github.com/owner/repo\n",
    "git@github.com:owner/repo.git",
  ])("rejects unsafe or unsupported input %s", (input) => {
    expect(() => canonicalizeGitHubRepository(input)).toThrow(RepositoryUrlError);
  });
});
