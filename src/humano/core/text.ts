const stopWords = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "has",
  "have",
  "i",
  "if",
  "in",
  "is",
  "it",
  "me",
  "my",
  "of",
  "on",
  "or",
  "so",
  "that",
  "the",
  "this",
  "to",
  "was",
  "we",
  "what",
  "when",
  "with",
  "you",
  "your",
]);

export function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Returns true when two normalized strings differ by at most a small edit count. */
export function isWithinEditDistance(
  left: string,
  right: string,
  maxDistance: number,
): boolean {
  const leftCharacters = Array.from(normalizeText(left));
  const rightCharacters = Array.from(normalizeText(right));
  if (Math.abs(leftCharacters.length - rightCharacters.length) > maxDistance) {
    return false;
  }

  let previous = rightCharacters.map((_, index) => index + 1);
  previous.unshift(0);

  for (let leftIndex = 0; leftIndex < leftCharacters.length; leftIndex += 1) {
    const current = [leftIndex + 1];
    let rowMinimum = current[0] ?? Number.POSITIVE_INFINITY;

    for (
      let rightIndex = 0;
      rightIndex < rightCharacters.length;
      rightIndex += 1
    ) {
      const substitutionCost =
        leftCharacters[leftIndex] === rightCharacters[rightIndex] ? 0 : 1;
      const distance = Math.min(
        (previous[rightIndex + 1] ?? Number.POSITIVE_INFINITY) + 1,
        (current[rightIndex] ?? Number.POSITIVE_INFINITY) + 1,
        (previous[rightIndex] ?? Number.POSITIVE_INFINITY) + substitutionCost,
      );
      current.push(distance);
      rowMinimum = Math.min(rowMinimum, distance);
    }

    if (rowMinimum > maxDistance) return false;
    previous = current;
  }

  return (previous.at(-1) ?? Number.POSITIVE_INFINITY) <= maxDistance;
}

export function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 1 && !stopWords.has(token));
}

export function uniqueTokens(value: string): Set<string> {
  return new Set(tokenize(value));
}

export function lexicalOverlap(left: string, right: string): number {
  const leftTokens = uniqueTokens(left);
  const rightTokens = uniqueTokens(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let matches = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) matches += 1;
  }
  return matches / Math.max(leftTokens.size, rightTokens.size);
}

export function countWords(value: string): number {
  return value.trim() ? value.trim().split(/\s+/u).length : 0;
}

export function countSentences(value: string): number {
  const matches = value.match(/[^.!?]+[.!?]+|[^.!?]+$/gu);
  return matches?.filter((part) => part.trim()).length ?? 0;
}

export function includesAny(value: string, patterns: readonly string[]): boolean {
  const normalized = value.toLocaleLowerCase();
  return patterns.some((pattern) =>
    normalized.includes(pattern.toLocaleLowerCase()),
  );
}

export function countPatternHits(
  value: string,
  patterns: readonly string[],
): number {
  const normalized = value.toLocaleLowerCase();
  return patterns.reduce(
    (total, pattern) =>
      total + (normalized.includes(pattern.toLocaleLowerCase()) ? 1 : 0),
    0,
  );
}

export function stripQuotedAndCode(value: string): string {
  return value
    .replace(/```[\s\S]*?```/gu, " ")
    .replace(/`[^`]*`/gu, " ")
    .replace(/"[^"\n]*"/gu, " ")
    .replace(
      /(^|[\s([{])'[^'\n]+'(?=$|[\s)\]},.!?])/gu,
      "$1 ",
    );
}

export function exponentialRecency(
  thenIso: string,
  now: Date,
  halfLifeDays: number,
): number {
  const ageMs = Math.max(0, now.getTime() - new Date(thenIso).getTime());
  const ageDays = ageMs / 86_400_000;
  return 2 ** (-ageDays / halfLifeDays);
}

export function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function redactSecrets(value: string, marker = "[REDACTED]"): string {
  return value
    .replace(/\bsk-(?:or-)?[A-Za-z0-9_-]{16,}\b/gu, marker)
    .replace(
      /\b(?:api[_ -]?key|password|passcode|secret|token)\s*[:=]\s*\S+/giu,
      marker,
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/giu, marker);
}

export function roundScore(value: number): number {
  return Math.round(clamp(value) * 1000) / 1000;
}
