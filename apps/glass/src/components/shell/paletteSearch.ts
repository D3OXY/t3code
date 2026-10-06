/** A searchable piece of an item, e.g. a session's title (weighted high) or branch (low). */
export interface SearchField {
  readonly text: string;
  readonly weight: number;
}

export interface FieldsMatch {
  readonly score: number;
  /** Matched character indices per field, sorted, for highlighting. */
  readonly highlights: ReadonlyArray<ReadonlyArray<number>>;
}

const isWordStart = (text: string, index: number) =>
  index === 0 || /[\s/\-_.@:]/.test(text[index - 1] ?? "");

/**
 * Scores one lowercase token against a text. A contiguous substring wins over
 * a scattered subsequence; word starts and earlier positions score higher.
 * Returns null when the token is not a subsequence of the text.
 */
export function matchToken(
  token: string,
  text: string,
): { readonly score: number; readonly indices: ReadonlyArray<number> } | null {
  if (token.length === 0) return { score: 0, indices: [] };
  const haystack = text.toLowerCase();

  const substringAt = haystack.indexOf(token);
  if (substringAt !== -1) {
    // Prefer a later occurrence that starts a word ("fix-auth" for "auth").
    let at = substringAt;
    for (let next = substringAt; next !== -1; next = haystack.indexOf(token, next + 1)) {
      if (isWordStart(haystack, next)) {
        at = next;
        break;
      }
    }
    const indices = Array.from({ length: token.length }, (_, offset) => at + offset);
    return {
      score: 100 + token.length * 4 + (isWordStart(haystack, at) ? 30 : 0) - Math.min(at, 40) * 0.5,
      indices,
    };
  }

  const indices: number[] = [];
  let score = 0;
  let cursor = 0;
  for (const char of token) {
    const found = haystack.indexOf(char, cursor);
    if (found === -1) return null;
    const previous = indices[indices.length - 1];
    if (previous !== undefined && found === previous + 1) score += 6;
    else if (previous !== undefined) score -= Math.min(found - previous, 12) * 0.5;
    if (isWordStart(haystack, found)) score += 8;
    score += 2;
    indices.push(found);
    cursor = found + 1;
  }
  return { score: score - Math.min(indices[0] ?? 0, 40) * 0.25, indices };
}

/**
 * Matches a whitespace-separated query against an item's fields. Every token
 * must match at least one field; each token counts its best weighted field.
 * An empty query matches everything with score 0.
 */
export function matchFields(query: string, fields: ReadonlyArray<SearchField>): FieldsMatch | null {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const highlights = fields.map(() => new Set<number>());
  let total = 0;
  for (const token of tokens) {
    let best: { score: number; field: number; indices: ReadonlyArray<number> } | null = null;
    for (const [fieldIndex, field] of fields.entries()) {
      const match = matchToken(token, field.text);
      if (match === null) continue;
      const weighted = match.score * field.weight;
      if (best === null || weighted > best.score) {
        best = { score: weighted, field: fieldIndex, indices: match.indices };
      }
    }
    if (best === null) return null;
    total += best.score;
    for (const index of best.indices) highlights[best.field]?.add(index);
  }
  return {
    score: total,
    highlights: highlights.map((set) => [...set].sort((a, b) => a - b)),
  };
}
