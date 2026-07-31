const STORAGE_KEY = "vhht:sound-settings:v1";
const DEFAULT_SETTINGS = Object.freeze({
  muted: false,
  effectsEnabled: true,
  musicEnabled: true,
  masterVolume: 0.72,
  effectsVolume: 0.62,
  musicVolume: 0.16
});

const SOUND_COOLDOWNS = Object.freeze({
  soft: 70,
  primary: 90,
  toggle: 90,
  open: 120,
  close: 120,
  success: 300,
  error: 420,
  warning: 320,
  notification: 700,
  danger: 420
});

// Tất cả đường dẫn được tính từ module này nên hoạt động cả ở localhost và GitHub Pages.
// Chỉ cần thay file MP3 cùng tên trong shared/assets/audio để đổi chất âm.
const AUDIO_ASSETS = Object.freeze({
  soft: new URL("../assets/audio/ui/click-soft.mp3", import.meta.url).href,
  primary: new URL("../assets/audio/ui/click-primary.mp3", import.meta.url).href,
  success: new URL("../assets/audio/feedback/success.mp3", import.meta.url).href,
  error: new URL("../assets/audio/feedback/error.mp3", import.meta.url).href,
  notification: new URL("../assets/audio/feedback/notification.mp3", import.meta.url).href,
  ambient: new URL("../assets/audio/music/community-space-loop.mp3", import.meta.url).href
});

const EFFECT_ASSET_MAP = Object.freeze({
  soft: "soft",
  primary: "primary",
  toggle: "soft",
  open: "soft",
  close: "soft",
  success: "success",
  error: "error",
  warning: "error",
  notification: "notification",
  danger: "error"
});

const EFFECT_FILE_LEVELS = Object.freeze({
  soft: .5,
  primary: .58,
  toggle: .46,
  open: .48,
  close: .44,
  success: .62,
  error: .58,
  warning: .5,
  notification: .62,
  danger: .58
});

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, Number(value) || 0));

function readSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      ...DEFAULT_SETTINGS,
      ...stored,
      masterVolume: clamp(stored.masterVolume ?? DEFAULT_SETTINGS.masterVolume),
      effectsVolume: clamp(stored.effectsVolume ?? DEFAULT_SETTINGS.effectsVolume),
      musicVolume: clamp(stored.musicVolume ?? DEFAULT_SETTINGS.musicVolume)
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

class VhhtSoundManager extends EventTarget {
  constructor() {
    super();
    this.settings = readSettings();
    this.context = null;
    this.masterGain = null;
    this.effectsGain = null;
    this.musicGain = null;
    this.lastPlayed = new Map();
    this.activeEffects = new Set();
    this.assetBuffers = new Map();
    this.assetFailures = new Set();
    this.preloadPromise = null;
    this.unlocked = false;
    this.ambient = null;
    this.ambientRequested = false;
    this.unlock = this.unlock.bind(this);
    this.installUnlockListeners();
    window.addEventListener("pagehide", () => this.cleanup(), { once: true });
    document.addEventListener("visibilitychange", () => {
      if (!this.context) return;
      if (document.hidden) this.context.suspend().catch(() => {});
      else if (this.unlocked) this.context.resume().catch(() => {});
    });
  }

  installUnlockListeners() {
    window.addEventListener("pointerdown", this.unlock, { once: true, passive: true, capture: true });
    window.addEventListener("keydown", this.unlock, { once: true, capture: true });
  }

  createGraph() {
    if (this.context) return this.context;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    this.context = new AudioCtx();
    this.masterGain = this.context.createGain();
    this.effectsGain = this.context.createGain();
    this.musicGain = this.context.createGain();
    this.effectsGain.connect(this.masterGain);
    this.musicGain.connect(this.masterGain);
    this.masterGain.connect(this.context.destination);
    this.applyGainSettings(true);
    return this.context;
  }

  async unlock() {
    const context = this.createGraph();
    if (!context) return false;
    try {
      if (context.state !== "running") await context.resume();
      this.unlocked = context.state === "running";
      if (this.unlocked) {
        await this.preload();
        if (this.ambientRequested) this.startAmbient();
      }
      this.dispatchEvent(new CustomEvent("unlock", { detail: { unlocked: this.unlocked } }));
      return this.unlocked;
    } catch {
      return false;
    }
  }

  preload() {
    if (this.preloadPromise) return this.preloadPromise;
    const context = this.createGraph();
    if (!context || typeof fetch !== "function") return Promise.resolve(false);

    this.preloadPromise = Promise.allSettled(Object.entries(AUDIO_ASSETS).map(async ([key, url]) => {
      const response = await fetch(url, { cache: "force-cache" });
      if (!response.ok) throw new Error(`Không tải được âm thanh ${key}: HTTP ${response.status}`);
      const encodedAudio = await response.arrayBuffer();
      const buffer = await context.decodeAudioData(encodedAudio.slice(0));
      this.assetBuffers.set(key, buffer);
      return key;
    })).then(results => {
      results.forEach((result, index) => {
        if (result.status === "rejected") this.assetFailures.add(Object.keys(AUDIO_ASSETS)[index]);
      });
      this.dispatchEvent(new CustomEvent("assetsready", {
        detail: { loaded: this.assetBuffers.size, failed: [...this.assetFailures] }
      }));
      return this.assetBuffers.size > 0;
    });

    return this.preloadPromise;
  }

  canPlay(type) {
    if (!this.unlocked || this.settings.muted || !this.settings.effectsEnabled) return false;
    const now = performance.now();
    const last = this.lastPlayed.get(type) || 0;
    if (now - last < (SOUND_COOLDOWNS[type] || 80)) return false;
    this.lastPlayed.set(type, now);
    return true;
  }

  tone(frequency, duration, options = {}) {
    if (!this.context || !this.effectsGain) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = options.wave || "sine";
    oscillator.frequency.setValueAtTime(frequency, now);
    if (options.to) oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, options.to), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(options.level || 0.12, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(this.effectsGain);
    this.activeEffects.add(oscillator);
    oscillator.addEventListener("ended", () => this.activeEffects.delete(oscillator), { once: true });
    oscillator.start(now);
    oscillator.stop(now + duration + 0.025);
  }

  playBuffer(type) {
    if (!this.context || !this.effectsGain) return false;
    const assetKey = EFFECT_ASSET_MAP[type] || EFFECT_ASSET_MAP.soft;
    const buffer = this.assetBuffers.get(assetKey);
    if (!buffer) return false;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    gain.gain.value = EFFECT_FILE_LEVELS[type] ?? EFFECT_FILE_LEVELS.soft;
    source.connect(gain).connect(this.effectsGain);
    this.activeEffects.add(source);
    source.addEventListener("ended", () => this.activeEffects.delete(source), { once: true });
    source.start();
    return true;
  }

  stop({ effects = true, music = true, rememberMusic = true } = {}) {
    if (effects) {
      this.activeEffects.forEach(oscillator => { try { oscillator.stop(); } catch {} });
      this.activeEffects.clear();
    }
    if (music) this.stopAmbient({ remember: rememberMusic });
  }

  play(type = "soft") {
    if (!this.canPlay(type)) return false;
    if (this.playBuffer(type)) return true;
    // Nếu MP3 chưa tải xong hoặc bị thiếu, dùng âm tổng hợp để thao tác vẫn có phản hồi.
    const patterns = {
      soft: () => this.tone(420, .055, { to: 510, level: .065 }),
      primary: () => { this.tone(430, .09, { to: 650, level: .09 }); this.tone(690, .12, { level: .045 }); },
      toggle: () => this.tone(570, .065, { to: 720, level: .07 }),
      open: () => { this.tone(360, .085, { to: 540, level: .07 }); this.tone(720, .11, { level: .035 }); },
      close: () => this.tone(520, .09, { to: 350, level: .065 }),
      success: () => { this.tone(440, .13, { to: 660, level: .08 }); setTimeout(() => this.tone(720, .16, { to: 880, level: .07 }), 70); },
      error: () => { this.tone(190, .17, { to: 125, wave: "triangle", level: .095 }); this.tone(255, .12, { to: 170, level: .04 }); },
      warning: () => { this.tone(330, .12, { wave: "triangle", level: .08 }); setTimeout(() => this.tone(300, .12, { wave: "triangle", level: .07 }), 95); },
      notification: () => { this.tone(660, .13, { to: 830, level: .075 }); setTimeout(() => this.tone(990, .18, { to: 1100, level: .06 }), 90); },
      danger: () => { this.tone(150, .2, { to: 105, wave: "sawtooth", level: .07 }); this.tone(220, .13, { to: 145, level: .045 }); }
    };
    (patterns[type] || patterns.soft)();
    return true;
  }

  startAmbient() {
    this.ambientRequested = true;
    if (!this.unlocked || this.ambient || this.settings.muted || !this.settings.musicEnabled) return false;
    const context = this.createGraph();
    if (!context || !this.musicGain) return false;
    const bus = context.createGain();
    const ambientBuffer = this.assetBuffers.get("ambient");
    if (ambientBuffer) {
      const source = context.createBufferSource();
      source.buffer = ambientBuffer;
      source.loop = true;
      source.connect(bus).connect(this.musicGain);
      bus.gain.value = 0.0001;
      bus.gain.exponentialRampToValueAtTime(.72, context.currentTime + 2.4);
      source.start();
      this.ambient = { kind: "file", bus, source, oscillators: [], lfo: null };
      this.dispatchEvent(new CustomEvent("ambientchange", { detail: { playing: true, source: "file" } }));
      return true;
    }

    const filter = context.createBiquadFilter();
    const lfo = context.createOscillator();
    const lfoGain = context.createGain();
    const oscillators = [55, 82.41, 110].map((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = index === 1 ? "triangle" : "sine";
      oscillator.frequency.value = frequency;
      gain.gain.value = [0.16, 0.075, 0.035][index];
      oscillator.connect(gain).connect(filter);
      oscillator.start();
      return oscillator;
    });
    filter.type = "lowpass";
    filter.frequency.value = 720;
    filter.Q.value = .35;
    lfo.frequency.value = .055;
    lfoGain.gain.value = 115;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
    filter.connect(bus).connect(this.musicGain);
    bus.gain.value = 0.0001;
    bus.gain.exponentialRampToValueAtTime(.62, context.currentTime + 2.4);
    this.ambient = { kind: "synth", bus, filter, lfo, oscillators };
    this.dispatchEvent(new CustomEvent("ambientchange", { detail: { playing: true, source: "synth" } }));
    return true;
  }

  stopAmbient({ remember = true } = {}) {
    if (remember) this.ambientRequested = false;
    if (!this.ambient || !this.context) return;
    const ambient = this.ambient;
    const now = this.context.currentTime;
    ambient.bus.gain.cancelScheduledValues(now);
    ambient.bus.gain.setValueAtTime(Math.max(.0001, ambient.bus.gain.value), now);
    ambient.bus.gain.exponentialRampToValueAtTime(.0001, now + .65);
    setTimeout(() => {
      ambient.oscillators?.forEach(node => { try { node.stop(); } catch {} });
      try { ambient.source?.stop(); } catch {}
      try { ambient.lfo?.stop(); } catch {}
      if (this.ambient === ambient) this.ambient = null;
      this.dispatchEvent(new CustomEvent("ambientchange", { detail: { playing: false } }));
    }, 720);
  }

  applyGainSettings(immediate = false) {
    if (!this.context || !this.masterGain) return;
    const at = this.context.currentTime;
    const method = immediate ? "setValueAtTime" : "linearRampToValueAtTime";
    this.masterGain.gain.cancelScheduledValues(at);
    this.effectsGain.gain.cancelScheduledValues(at);
    this.musicGain.gain.cancelScheduledValues(at);
    this.masterGain.gain[method](this.settings.muted ? 0 : this.settings.masterVolume, immediate ? at : at + .12);
    this.effectsGain.gain[method](this.settings.effectsEnabled ? this.settings.effectsVolume : 0, immediate ? at : at + .12);
    this.musicGain.gain[method](this.settings.musicEnabled ? this.settings.musicVolume : 0, immediate ? at : at + .2);
  }

  updateSettings(patch) {
    this.settings = {
      ...this.settings,
      ...patch,
      masterVolume: clamp(patch.masterVolume ?? this.settings.masterVolume),
      effectsVolume: clamp(patch.effectsVolume ?? this.settings.effectsVolume),
      musicVolume: clamp(patch.musicVolume ?? this.settings.musicVolume)
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    this.applyGainSettings();
    if (this.settings.muted || !this.settings.musicEnabled) this.stopAmbient({ remember: false });
    else if (this.ambientRequested) this.startAmbient();
    const detail = { ...this.settings, ambientPlaying: Boolean(this.ambient) };
    this.dispatchEvent(new CustomEvent("settingschange", { detail }));
    window.dispatchEvent(new CustomEvent("vhht:sound-settings-change", { detail }));
    return detail;
  }

  setMuted(muted) { return this.updateSettings({ muted: Boolean(muted) }); }
  setEffectsEnabled(enabled) { return this.updateSettings({ effectsEnabled: Boolean(enabled) }); }
  setMusicEnabled(enabled) { return this.updateSettings({ musicEnabled: Boolean(enabled) }); }
  setMasterVolume(value) { return this.updateSettings({ masterVolume: value }); }
  setEffectsVolume(value) { return this.updateSettings({ effectsVolume: value }); }
  setMusicVolume(value) { return this.updateSettings({ musicVolume: value }); }

  cleanup() {
    this.stop({ rememberMusic: false });
    if (this.context && this.context.state !== "closed") this.context.close().catch(() => {});
    this.context = null;
    this.unlocked = false;
  }
}

export const soundManager = new VhhtSoundManager();
export const preloadSounds = () => soundManager.preload();
export const playUiSound = type => soundManager.play(type);
export const stopSounds = options => soundManager.stop(options);
export const playBackgroundMusic = () => soundManager.startAmbient();
export const stopBackgroundMusic = options => soundManager.stopAmbient(options);
export const setSoundVolume = value => soundManager.setMasterVolume(value);
export const muteSounds = muted => soundManager.setMuted(muted);
export const enableSoundEffects = enabled => soundManager.setEffectsEnabled(enabled);
export const enableBackgroundMusic = enabled => soundManager.setMusicEnabled(enabled);

window.VHHTSound = Object.freeze({
  preloadSounds,
  playUiSound,
  stopSounds,
  playBackgroundMusic,
  stopBackgroundMusic,
  setSoundVolume,
  muteSounds,
  enableSoundEffects,
  enableBackgroundMusic,
  getSettings: () => ({ ...soundManager.settings })
});
