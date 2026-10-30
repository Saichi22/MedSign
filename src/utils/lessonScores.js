// src/utils/lessonScores.js
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'lessonBestScores:v1';

export async function getBestScores() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// Saves only if strictly better than the stored best, so the date is when the
// best score was first reached.
export async function saveBestScore(groupKey, score, total) {
  if (!total) return;
  try {
    const all = await getBestScores();
    const prev = all[groupKey];
    const better = !prev || score / total > prev.score / prev.total;
    if (better) {
      all[groupKey] = { score, total, date: new Date().toISOString() };
      await AsyncStorage.setItem(KEY, JSON.stringify(all));
    }
  } catch (e) {
    console.warn('[lessonScores] save failed:', e);
  }
}

export const formatScoreDate = (iso) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
