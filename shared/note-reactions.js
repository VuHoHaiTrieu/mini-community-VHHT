import { collection, deleteDoc, doc, getDocs, onSnapshot, serverTimestamp, setDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const NOTE_REACTIONS = Object.freeze({
  like: ["👍", "Thích"],
  love: ["❤️", "Yêu thích"],
  haha: ["😂", "Haha"],
  wow: ["😮", "Wow"],
  sad: ["😢", "Buồn"],
  support: ["🤗", "Đồng cảm"]
});

export function noteReactionsCollection(database, authorId) {
  return collection(database, "messengerNotes", authorId, "reactions");
}

export async function setNoteReaction(database, authorId, reactorId, type) {
  const reference = doc(database, "messengerNotes", authorId, "reactions", reactorId);
  if (!type) return deleteDoc(reference);
  if (!NOTE_REACTIONS[type]) throw new Error("Cảm xúc ghi chú không hợp lệ.");
  return setDoc(reference, { reactorId, type, createdAt: serverTimestamp() });
}

export function listenNoteReactions(database, authorId, callback, onError = console.warn) {
  return onSnapshot(noteReactionsCollection(database, authorId), snapshot => {
    callback(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
  }, onError);
}

export async function clearNoteReactions(database, authorId) {
  const snapshot = await getDocs(noteReactionsCollection(database, authorId));
  if (!snapshot.size) return;
  const batch = writeBatch(database);
  snapshot.docs.forEach(item => batch.delete(item.ref));
  await batch.commit();
}
