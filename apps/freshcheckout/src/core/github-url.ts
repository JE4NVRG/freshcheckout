export interface CanonicalGitHubRepository {
  inputUrl: string;
  canonicalUrl: string;
  cloneUrl: string;
  owner: string;
  repository: string;
}

const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

function containsControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

export class RepositoryUrlError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = "RepositoryUrlError";
    this.code = code;
  }
}

export function canonicalizeGitHubRepository(input: string): CanonicalGitHubRepository {
  if (containsControlCharacters(input)) {
    throw new RepositoryUrlError("control_characters", "Repository URL contains control characters.");
  }

  const value = input.trim();
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new RepositoryUrlError("invalid_url", "Enter a complete public GitHub repository URL.");
  }

  if (parsed.protocol !== "https:") {
    throw new RepositoryUrlError("https_required", "Only HTTPS GitHub URLs are accepted.");
  }
  if (parsed.hostname.toLowerCase() !== "github.com") {
    throw new RepositoryUrlError("github_only", "Only public github.com repositories are supported.");
  }
  if (parsed.username || parsed.password || parsed.port) {
    throw new RepositoryUrlError("credentials_forbidden", "Credentials and custom ports are not accepted.");
  }
  if (parsed.search || parsed.hash) {
    throw new RepositoryUrlError("query_forbidden", "Remove query parameters and fragments from the repository URL.");
  }

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(parsed.pathname);
  } catch {
    throw new RepositoryUrlError("invalid_encoding", "Repository URL contains invalid encoding.");
  }

  const segments = decodedPath.split("/").filter(Boolean);
  if (segments.length !== 2) {
    throw new RepositoryUrlError("repository_path_required", "Use the repository root URL: github.com/owner/repository.");
  }

  const owner = segments[0] ?? "";
  const rawRepository = segments[1] ?? "";
  const repository = rawRepository.endsWith(".git") ? rawRepository.slice(0, -4) : rawRepository;

  if (!OWNER_PATTERN.test(owner)) {
    throw new RepositoryUrlError("invalid_owner", "GitHub owner is not valid.");
  }
  if (!REPOSITORY_PATTERN.test(repository) || repository === "." || repository === "..") {
    throw new RepositoryUrlError("invalid_repository", "GitHub repository name is not valid.");
  }

  const canonicalUrl = `https://github.com/${owner}/${repository}`;
  return {
    inputUrl: input,
    canonicalUrl,
    cloneUrl: `${canonicalUrl}.git`,
    owner,
    repository,
  };
}
