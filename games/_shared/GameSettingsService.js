import { firebaseDatabase } from '../../shared/firebase-connection.js';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

export const DEFAULT_GAME_SETTINGS = Object.freeze({
  status: 'live',
  announcement: '',
  leaderboardEnabled: true,
  difficultyScale: 1
});

export function subscribeGameSettings(gameId, callback) {
  return onSnapshot(
    doc(firebaseDatabase, 'gameSettings', gameId),
    snapshot => callback({ ...DEFAULT_GAME_SETTINGS, ...(snapshot.exists() ? snapshot.data() : {}) }),
    () => callback({ ...DEFAULT_GAME_SETTINGS })
  );
}

export function saveGameSettings(gameId, settings) {
  return setDoc(doc(firebaseDatabase, 'gameSettings', gameId), {
    ...settings,
    updatedAt: serverTimestamp()
  }, { merge: true });
}
