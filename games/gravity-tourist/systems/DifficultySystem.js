export function getDifficulty(approaches, elapsed) {
  const progress = Math.min(1, approaches / 45 + elapsed / 420);
  return {
    progress,
    orbitSpeed: 1 + progress * .42,
    launchSpeed: 1 + progress * .12,
    spacing: 1 + progress * .18,
    debrisChance: .14 + progress * .42,
    alert: progress < .2 ? 'OBSERVING' : progress < .48 ? 'SUSPICIOUS' : progress < .76 ? 'PANIC' : 'INVASION ALERT'
  };
}
