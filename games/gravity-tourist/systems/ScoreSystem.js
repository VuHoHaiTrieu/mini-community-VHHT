import { SCORE_CONFIG } from '../config/game-config.js';

export class ScoreSystem {
  reset() { this.score = 0; this.combo = 0; this.bestCombo = 0; this.perfect = 0; this.multiplier = 1; this.message = ''; this.messageTime = 0; }
  constructor() { this.reset(); }
  capture(body, quality) {
    if (quality === 'perfect') { this.combo++; this.perfect++; this.message = 'PERFECT ENTRY'; }
    else if (quality === 'good') { this.combo++; this.message = 'GOOD ENTRY'; }
    else { this.combo = 0; this.message = 'ROUGH CATCH'; }
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.multiplier = Math.min(SCORE_CONFIG.maxMultiplier, 1 + this.combo * SCORE_CONFIG.comboStep);
    const qualityScore = quality === 'perfect' ? SCORE_CONFIG.perfect : quality === 'good' ? SCORE_CONFIG.good : SCORE_CONFIG.bad;
    this.score += Math.round((body.reward + qualityScore) * this.multiplier);
    this.messageTime = 1.2;
  }
  noProgress() { this.combo = 0; this.multiplier = 1; this.message = 'NO FORWARD PROGRESS'; this.messageTime = 1.2; }
  update(dt) { if (this.messageTime > 0) this.messageTime -= dt; }
}
