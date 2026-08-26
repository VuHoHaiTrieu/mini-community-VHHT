const GLOBAL_SETTINGS_KEY = 'vhht:game-audio-settings:v1';
const GAME_SETTINGS_KEY = 'vhht:gravity-tourist-audio:v1';

const CUE_FOLDERS = Object.freeze({
  'title-theme':'music','intro-flight':'music','navigation-failure':'music','gameplay-observing':'music','gameplay-suspicious':'music','gameplay-panic':'music','gameplay-invasion-alert':'music','pause-ambient':'music','game-over':'music','new-record':'music','leaderboard-theme':'music',
  'ufo-engine-loop':'ufo','ufo-fly-in':'ufo','navigation-warning':'ufo','control-burnout':'ufo','engine-sputter':'ufo','gravity-lock':'ufo','orbit-loop':'ufo','orbit-speed-up':'ufo','ufo-launch':'ufo','ufo-launch-perfect':'ufo','ufo-flyby':'ufo','ufo-lost':'ufo',
  'gravity-enter':'gravity','gravity-capture':'gravity','gravity-assist':'gravity','gravity-assist-perfect':'gravity','gravity-assist-risk':'gravity','gravity-near-miss':'gravity','gravity-field-hum':'gravity','planet-pass':'gravity',
  'earth-defense-online':'earth-defense','target-lock-warning':'earth-defense','missile-launch-distant':'earth-defense','missile-flyby':'earth-defense','energy-shot':'earth-defense','energy-projectile-loop':'earth-defense','laser-charge':'earth-defense','laser-fire':'earth-defense','defense-salvo':'earth-defense','defense-intercept':'earth-defense','projectile-explosion':'earth-defense','invasion-alert-siren':'earth-defense',
  'debris-warning':'hazards','debris-drift':'hazards','broken-missile-spin':'hazards','space-mine-pulse':'hazards','hazard-near-miss':'hazards','hazard-impact':'hazards','ufo-damage':'hazards',
  'score-gain':'scoring','no-progress':'scoring','combo-up':'scoring','combo-break':'scoring','personal-best-close':'scoring','personal-best-beaten':'scoring','rank-up':'scoring','top-three':'scoring','countdown':'scoring',
  'alien-happy':'alien','alien-excited':'alien','alien-surprised':'alien','alien-scared':'alien','alien-relieved':'alien','alien-confused':'alien','alien-sad':'alien','alien-record':'alien',
  'ui-click':'ui','pause-open':'ui','pause-close':'ui','restart':'ui','leaderboard-open':'ui','leaderboard-row-enter':'ui','result-reveal':'ui','setting-toggle':'ui','volume-change':'ui'
});

const clamp = value => Math.min(1, Math.max(0, Number(value) || 0));

export class GameAudio {
  constructor() {
    this.music = null; this.loops = new Map(); this.active = new Set(); this.lastPlayed = new Map(); this.introTimers = [];
    const probe = document.createElement('audio'); this.extension = probe.canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'mp3';
    this.globalSettings = this.readSettings(GLOBAL_SETTINGS_KEY,{muted:false,effectsEnabled:true,musicEnabled:true,masterVolume:.78,effectsVolume:.7,musicVolume:.48});
    this.settings = this.readSettings(GAME_SETTINGS_KEY,{effectsEnabled:true,musicEnabled:true,effectsVolume:1,musicVolume:1});
    window.addEventListener('vhht:game-audio-settings-change', event => { this.globalSettings = { ...this.globalSettings, ...(event.detail || {}) }; this.applyVolumes(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pauseAll(); });
    window.addEventListener('blur',()=>this.pauseAll(),{passive:true});
    window.addEventListener('pagehide',()=>this.pauseAll(),{passive:true});
  }
  readSettings(key,defaults) { try { return { ...defaults,...JSON.parse(localStorage.getItem(key)||'{}') }; } catch { return { ...defaults }; } }
  url(name) { return new URL(`../assets/audio/${CUE_FOLDERS[name]}/${name}.${this.extension}`, import.meta.url).href; }
  effectVolume(level=1) { const global=this.globalSettings,local=this.settings;return global.muted||!global.effectsEnabled||!local.effectsEnabled?0:clamp(global.masterVolume)*clamp(global.effectsVolume)*clamp(local.effectsVolume)*level; }
  musicVolume(level=1) { const global=this.globalSettings,local=this.settings;return global.muted||!global.musicEnabled||!local.musicEnabled?0:clamp(global.masterVolume)*clamp(global.musicVolume)*clamp(local.musicVolume)*level; }
  play(name,{level=.72,rate=1,cooldown=60}={}) { if(!CUE_FOLDERS[name]||this.effectVolume(level)<=0)return null;const now=performance.now();if(now-(this.lastPlayed.get(name)||0)<cooldown)return null;this.lastPlayed.set(name,now);const audio=new Audio(this.url(name));audio.preload='auto';audio.volume=this.effectVolume(level);audio.playbackRate=rate;this.active.add(audio);audio.addEventListener('ended',()=>this.active.delete(audio),{once:true});audio.play().catch(()=>this.active.delete(audio));return audio; }
  setLoop(name,enabled,{level=.25,rate=1}={}) { const current=this.loops.get(name);if(!enabled){if(current){current.pause();current.currentTime=0;this.loops.delete(name);}return;}if(current){current.volume=this.effectVolume(level);current.playbackRate=rate;if(current.paused&&!document.hidden)current.play().catch(()=>{});return;}const audio=new Audio(this.url(name));audio.loop=true;audio.preload='auto';audio.volume=this.effectVolume(level);audio.playbackRate=rate;this.loops.set(name,audio);audio.play().catch(()=>{}); }
  setMusic(name,{level=.82,fade=1}={}) { if(this.music?.name===name){this.music.level=level;this.applyVolumes();if(this.music.audio.paused&&!document.hidden)this.music.audio.play().catch(()=>{});return;}const previous=this.music,newAudio=new Audio(this.url(name));newAudio.loop=true;newAudio.preload='auto';newAudio.volume=.0001;this.music={name,audio:newAudio,level};newAudio.play().catch(()=>{});const started=performance.now(),target=this.musicVolume(level);const crossfade=()=>{const t=Math.min(1,(performance.now()-started)/(fade*1000));newAudio.volume=Math.max(.0001,target*t);if(previous)previous.audio.volume=Math.max(.0001,this.musicVolume(previous.level)*(1-t));if(t<1)requestAnimationFrame(crossfade);else if(previous){previous.audio.pause();previous.audio.currentTime=0;}};requestAnimationFrame(crossfade); }
  stopMusic(fade=.45) { const current=this.music;if(!current)return;this.music=null;const started=performance.now(),initial=current.audio.volume;const fadeOut=()=>{const t=Math.min(1,(performance.now()-started)/(fade*1000));current.audio.volume=Math.max(.0001,initial*(1-t));if(t<1)requestAnimationFrame(fadeOut);else{current.audio.pause();current.audio.currentTime=0;}};requestAnimationFrame(fadeOut); }
  playIntro() { this.clearIntro();this.setMusic('intro-flight',{level:.78,fade:.6});this.play('ufo-fly-in',{level:.78});this.introTimers.push(setTimeout(()=>this.play('navigation-warning',{level:.9}),900),setTimeout(()=>{this.play('control-burnout',{level:.9});this.play('navigation-failure',{level:.76});},1450),setTimeout(()=>this.play('engine-sputter',{level:.72}),1950),setTimeout(()=>this.play('gravity-lock',{level:.82}),2500)); }
  clearIntro(){this.introTimers.forEach(clearTimeout);this.introTimers=[];}
  gameplay(alert) { const track={OBSERVING:'gameplay-observing',SUSPICIOUS:'gameplay-suspicious',PANIC:'gameplay-panic','INVASION ALERT':'gameplay-invasion-alert'}[alert]||'gameplay-observing';this.setMusic(track,{level:.78,fade:1}); }
  pauseAll(){this.music?.audio.pause();this.loops.forEach(audio=>audio.pause());}
  resumeMusic(){if(this.music&&this.musicVolume(this.music.level)>0)this.music.audio.play().catch(()=>{});this.loops.forEach(audio=>audio.play().catch(()=>{}));}
  applyVolumes(){if(this.music)this.music.audio.volume=this.musicVolume(this.music.level);for(const [name,audio]of this.loops)audio.volume=this.effectVolume(name==='orbit-loop'?.22:.25);if(this.globalSettings.muted){this.active.forEach(audio=>audio.pause());}}
  updateGameSettings(patch){this.settings={...this.settings,...patch};try{localStorage.setItem(GAME_SETTINGS_KEY,JSON.stringify(this.settings));}catch{}this.applyVolumes();if(this.musicVolume(1)>0)this.resumeMusic();return this.settings;}
  stopEffects(){this.active.forEach(audio=>{audio.pause();audio.currentTime=0;});this.active.clear();this.loops.forEach(audio=>audio.pause());this.loops.clear();}
}

export const gameAudio = new GameAudio();
