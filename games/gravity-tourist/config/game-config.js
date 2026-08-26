export const WORLD = { width: 960, height: 540 };

export const GAME_CONFIG = {
  fixedStep: 1 / 120,
  maxFrameTime: 0.05,
  startBody: { x: 260, y: 290, kind: 'normal' },
  launchSpeed: 305,
  travelGravity: 92000,
  maxTravelSpeed: 510,
  captureSpeed: 525,
  missMargin: 190,
  comboGrace: 4,
  trailLength: 42,
  storageKey: 'gravity-tourist-records-v1'
};

export const BODY_TYPES = {
  normal: { radius: 27, captureRadius: 82, orbitRadius: 58, orbitSpeed: 1.65, color: '#746cff', glow: '#8f8aff', reward: 110, label: 'SAFE · ×1' },
  small: { radius: 13, captureRadius: 51, orbitRadius: 38, orbitSpeed: 2.7, color: '#ffb85c', glow: '#ffcc73', reward: 260, label: 'RISK · ×2' },
  large: { radius: 43, captureRadius: 108, orbitRadius: 78, orbitSpeed: 1.28, color: '#48d6c4', glow: '#64ffe0', reward: 160, label: 'SLINGSHOT · ×1.5' }
  ,ice: { radius: 21, captureRadius: 61, orbitRadius: 45, orbitSpeed: 2.15, color: '#9cecff', glow: '#b7f7ff', reward: 220, label: 'ICE MOON · ×2' }
  ,volcanic: { radius: 24, captureRadius: 58, orbitRadius: 44, orbitSpeed: 2.35, color: '#ff563d', glow: '#ff744f', reward: 310, label: 'VOLCANIC · ×3' }
  ,desert: { radius: 38, captureRadius: 98, orbitRadius: 70, orbitSpeed: 1.38, color: '#e9a45d', glow: '#ffc879', reward: 180, label: 'RINGED WORLD · ×2' }
  ,hub: { radius: 29, captureRadius: 76, orbitRadius: 55, orbitSpeed: 1.85, color: '#6ab8ff', glow: '#59dfff', reward: 260, label: 'GRAVITY HUB · ×2.5' }
  ,storm: { radius: 33, captureRadius: 86, orbitRadius: 62, orbitSpeed: 1.7, color: '#43b8df', glow: '#68e8ff', reward: 210, label: 'STORM WORLD · ×2' }
  ,crystal: { radius: 18, captureRadius: 55, orbitRadius: 41, orbitSpeed: 2.55, color: '#c47cff', glow: '#e4a5ff', reward: 330, label: 'CRYSTAL MOON · ×3' }
  ,toxic: { radius: 25, captureRadius: 64, orbitRadius: 47, orbitSpeed: 2.15, color: '#9bd542', glow: '#c7ff62', reward: 300, label: 'TOXIC WORLD · ×3' }
  ,dwarf: { radius: 11, captureRadius: 44, orbitRadius: 34, orbitSpeed: 3.05, color: '#e6b29b', glow: '#ffd0ba', reward: 390, label: 'DWARF · ×4' }
  ,station: { radius: 24, captureRadius: 62, orbitRadius: 46, orbitSpeed: 2.45, color: '#c5d8ed', glow: '#54cfff', reward: 340, label: 'ORBITAL STATION · ×3' }
  ,satellite: { radius: 14, captureRadius: 45, orbitRadius: 34, orbitSpeed: 3.35, color: '#8fb8e9', glow: '#58aaff', reward: 420, label: 'HUMAN SATELLITE · ×4' }
  ,defenseNode: { radius: 20, captureRadius: 52, orbitRadius: 39, orbitSpeed: 2.9, color: '#e05568', glow: '#ff526f', reward: 480, label: 'DEFENSE NODE · ×5' }
  ,aurora: { radius: 31, captureRadius: 79, orbitRadius: 57, orbitSpeed: 1.92, color: '#38dcb4', glow: '#57ffd7', reward: 250, label: 'AURORA WORLD · ×2.5' }
  ,ember: { radius: 17, captureRadius: 49, orbitRadius: 37, orbitSpeed: 3.2, color: '#ff7948', glow: '#ff9a5c', reward: 410, label: 'EMBER MOON · ×4' }
  ,ringMoon: { radius: 23, captureRadius: 65, orbitRadius: 47, orbitSpeed: 2.32, color: '#d7a9ff', glow: '#d797ff', reward: 315, label: 'RING MOON · ×3' }
  ,pulsar: { radius: 15, captureRadius: 47, orbitRadius: 35, orbitSpeed: 3.55, color: '#e8f7ff', glow: '#6eeaff', reward: 460, label: 'PULSAR RELAY · ×5' }
  ,roseGiant: { radius: 36, captureRadius: 91, orbitRadius: 66, orbitSpeed: 1.48, color: '#f1a6c1', glow: '#ffbad5', reward: 205, label: 'ROSE GIANT · ×2' }
  ,abyss: { radius: 28, captureRadius: 72, orbitRadius: 52, orbitSpeed: 2.08, color: '#176ba8', glow: '#2bbcff', reward: 275, label: 'ABYSS WORLD · ×3' }
  ,goldRing: { radius: 34, captureRadius: 88, orbitRadius: 63, orbitSpeed: 1.72, color: '#e9ad36', glow: '#ffd96a', reward: 235, label: 'GOLDEN RING · ×2' }
  ,canyon: { radius: 26, captureRadius: 68, orbitRadius: 49, orbitSpeed: 2.27, color: '#bd5f35', glow: '#ff8955', reward: 305, label: 'CANYON WORLD · ×3' }
  ,whiteStorm: { radius: 39, captureRadius: 96, orbitRadius: 70, orbitSpeed: 1.36, color: '#b9d9ee', glow: '#d5f3ff', reward: 195, label: 'WHITE STORM · ×2' }
};

export const SCORE_CONFIG = { perfect: 180, good: 80, bad: 30, nearMiss: 60, comboStep: 0.25, maxMultiplier: 6 };
