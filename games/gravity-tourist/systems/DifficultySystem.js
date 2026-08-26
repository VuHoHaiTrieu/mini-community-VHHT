export function getDifficulty(approaches, elapsed) {
  const progress = Math.min(1, approaches / 36 + elapsed / 330);
  return {
    progress,
    orbitSpeed: 1 + progress * .9,
    launchSpeed: 1 + progress * .3,
    spacing: 1 + progress * .24,
    debrisChance: .12 + progress * .58,
    alert: progress < .2 ? 'OBSERVING' : progress < .48 ? 'SUSPICIOUS' : progress < .76 ? 'PANIC' : 'INVASION ALERT'
  };
}
