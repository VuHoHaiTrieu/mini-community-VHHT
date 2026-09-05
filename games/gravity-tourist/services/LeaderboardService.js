import { firebaseAuthentication, firebaseDatabase } from '../../../shared/firebase-connection.js';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const scoresPath = ['gameLeaderboards', 'gravity-tourist', 'scores'];
const scoresCollection = () => collection(firebaseDatabase, ...scoresPath);

export async function loadLeaderboard(maximum = 20) {
  await firebaseAuthentication.authStateReady();
  if (!firebaseAuthentication.currentUser) return [];
  const snapshot = await getDocs(query(scoresCollection(), orderBy('highScore', 'desc'), limit(maximum)));
  return snapshot.docs.map((entry, index) => ({ rank: index + 1, id: entry.id, ...entry.data() }));
}

export async function loadMyLeaderboardRecord() {
  await firebaseAuthentication.authStateReady();
  const user = firebaseAuthentication.currentUser;
  if (!user) return null;
  const snapshot = await getDoc(doc(firebaseDatabase, ...scoresPath, user.uid));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export async function submitLeaderboardRun(run) {
  await firebaseAuthentication.authStateReady();
  const user = firebaseAuthentication.currentUser;
  if (!user) return false;
  const reference = doc(firebaseDatabase, ...scoresPath, user.uid);
  await runTransaction(firebaseDatabase, async transaction => {
    const previous = await transaction.get(reference), current = previous.exists() ? previous.data() : {};
    transaction.set(reference, {
      userId: user.uid,
      displayName: user.displayName || user.email?.split('@')[0] || 'VHHT Traveller',
      photoURL: user.photoURL || '',
      highScore: Math.max(Number(current.highScore) || 0, Number(run.score) || 0),
      longestSurvival: Math.max(Number(current.longestSurvival) || 0, Number(run.elapsed) || 0),
      highestApproach: Math.max(Number(current.highestApproach) || 0, Number(run.approaches) || 0),
      longestCombo: Math.max(Number(current.longestCombo) || 0, Number(run.bestCombo) || 0),
      updatedAt: serverTimestamp()
    }, { merge: true });
  });
  return true;
}
