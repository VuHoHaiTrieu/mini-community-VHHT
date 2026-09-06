export function getDifficulty(approaches, elapsed) {
  return updateDifficulty({}, approaches, elapsed);
}

export function updateDifficulty(target, approaches, elapsed) {
  const progress = Math.min(1, approaches / 36 + elapsed / 330);
  target.progress=progress;
  target.orbitSpeed=1+progress*.9;
  target.launchSpeed=1+progress*.3;
  target.spacing=1+progress*.24;
  target.debrisChance=.12+progress*.58;
  target.alert=progress<.2?'OBSERVING':progress<.48?'SUSPICIOUS':progress<.76?'PANIC':'INVASION ALERT';
  return target;
}
