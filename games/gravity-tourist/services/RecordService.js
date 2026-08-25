import { GAME_CONFIG } from '../config/game-config.js';
import { readJson, writeJson } from '../utils/storage.js';

const empty = { highScore: 0, longestSurvival: 0, highestApproach: 0, longestCombo: 0 };
export const getRecords = () => readJson(GAME_CONFIG.storageKey, empty);
export function saveRun(run) {
  const before = getRecords();
  const records = { highScore: Math.max(before.highScore, run.score), longestSurvival: Math.max(before.longestSurvival, run.elapsed), highestApproach: Math.max(before.highestApproach, run.approaches), longestCombo: Math.max(before.longestCombo, run.bestCombo) };
  writeJson(GAME_CONFIG.storageKey, records);
  return { records, isNewBest: run.score > before.highScore, previousScore: before.highScore };
}
