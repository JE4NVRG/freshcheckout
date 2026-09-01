const SECRET_PATTERNS: ReadonlyArray<RegExp> = [
  /\bslr_live_[A-Za-z0-9_-]+\b/g,
  /\bgh[oprsu]_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|password|secret)\s*[=:]\s*[^\s,;]+/gi,
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*\b/gi,
];

export function redactSecrets(value: string): string {
  return SECRET_PATTERNS.reduce((redacted, pattern) => redacted.replace(pattern, "[REDACTED]"), value);
}

export function boundLog(value: string, maxBytes = 64_000): string {
  const redacted = redactSecrets(value.replace(/\r\n/g, "\n"));
  const encoded = Buffer.from(redacted, "utf8");
  if (encoded.byteLength <= maxBytes) {
    return redacted;
  }

  const marker = "\n… output truncated by FreshCheckout policy …\n";
  const markerBytes = Buffer.byteLength(marker);
  const remaining = Math.max(0, maxBytes - markerBytes);
  const headLength = Math.floor(remaining * 0.7);
  const tailLength = remaining - headLength;
  const head = encoded.subarray(0, headLength).toString("utf8");
  const tail = encoded.subarray(encoded.byteLength - tailLength).toString("utf8");
  return `${head}${marker}${tail}`;
}
