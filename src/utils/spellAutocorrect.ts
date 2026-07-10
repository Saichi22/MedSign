/**
 * spellAutocorrect.ts
 *
 * Autocorrect for spelled-out words in spelling mode. Supports two
 * separate, non-overlapping wordlists (English and Tagalog/Filipino).
 * Which one is used is decided ENTIRELY by the caller passing an
 * explicit `language` argument — there is no auto-detection, so a
 * spelled word can never accidentally get checked against the wrong
 * language's dictionary.
 *
 * Matching strategy:
 * - Candidates are pre-grouped by length so we only ever compare
 *   against words within maxDistance of the input's length.
 * - Uses Levenshtein edit distance (insertions, deletions, substitutions).
 * - If there is exactly ONE candidate at the minimum distance, it's
 *   applied automatically.
 * - If there is a TIE (multiple candidates at the minimum distance),
 *   no automatic correction happens — instead all tied candidates are
 *   returned as `suggestions` so the caller can let the user pick.
 */

import englishWordListByLength from '../assets/wordlist_by_length.json';
import tagalogWordListByLength from '../assets/tagalog_wordlist_by_length.json';

const MAX_DISTANCE = 3;
const CORRECTION_DISTANCE_CAP = 2;

type WordListByLength = Record<string, string[]>;

export type SpellLanguage = 'en' | 'fil';

const WORDLISTS: Record<SpellLanguage, WordListByLength> = {
  en: englishWordListByLength as WordListByLength,
  fil: tagalogWordListByLength as WordListByLength,
};

function levenshtein(a: string, b: string): number {
  const alen = a.length;
  const blen = b.length;
  if (alen === 0) return blen;
  if (blen === 0) return alen;

  let prevRow = new Array(blen + 1);
  let currRow = new Array(blen + 1);

  for (let j = 0; j <= blen; j++) prevRow[j] = j;

  for (let i = 1; i <= alen; i++) {
    currRow[0] = i;
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= blen; j++) {
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j] + 1,
        currRow[j - 1] + 1,
        prevRow[j - 1] + cost,
      );
    }
    [prevRow, currRow] = [currRow, prevRow];
  }

  return prevRow[blen];
}

export interface AutocorrectResult {
  /** The corrected word, or the original input if no unambiguous match was found. */
  word: string;
  /** True if a correction was actually applied automatically. */
  corrected: boolean;
  /**
   * Present only when multiple candidates tied for the closest distance.
   * When set, `word` is still the original spelled input — the caller
   * should let the user choose between these instead of auto-applying.
   */
  suggestions?: string[];
}

export function autocorrectSpelledWord(
  input: string,
  language: SpellLanguage,
): AutocorrectResult {
  const word = input.toUpperCase();
  const wordlist = WORDLISTS[language];

  const exactBucket = wordlist[String(word.length)];
  if (exactBucket && exactBucket.includes(word)) {
    return { word, corrected: false };
  }

  let bestDistance = Infinity;
  let bestCandidates: string[] = [];

  for (let len = word.length - MAX_DISTANCE; len <= word.length + MAX_DISTANCE; len++) {
    if (len < 1) continue;
    const bucket = wordlist[String(len)];
    if (!bucket) continue;

    for (const candidate of bucket) {
      const dist = levenshtein(word, candidate);
      if (dist > MAX_DISTANCE) continue;

      if (dist < bestDistance) {
        bestDistance = dist;
        bestCandidates = [candidate];
      } else if (dist === bestDistance) {
        bestCandidates.push(candidate);
      }
    }
  }

  if (bestDistance > CORRECTION_DISTANCE_CAP || bestCandidates.length === 0) {
    // No sufficiently close match — leave the spelled word untouched.
    return { word, corrected: false };
  }

  if (bestCandidates.length === 1) {
    return { word: bestCandidates[0], corrected: true };
  }

  // Tie: multiple equally-close candidates. Don't guess — surface them
  // as suggestions and let the user pick. `word` stays the raw spelled
  // input so the UI can offer it too, in case autocorrect is off track
  // entirely.
  return { word, corrected: false, suggestions: bestCandidates };
}