const SETTINGS_KEY='vhht:sound-settings:v1';
const audioUrl=(name,extension)=>new URL(`../assets/audio/${name}.${extension}`,import.meta.url).href;
const settings=()=>{try{return{muted:false,effectsEnabled:true,musicEnabled:true,masterVolume:.72,effectsVolume:.62,musicVolume:.34,...JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')}}catch{return{muted:false,effectsEnabled:true,musicEnabled:true,masterVolume:.72,effectsVolume:.62,musicVolume:.34}}};
const extension=document.createElement('audio').canPlayType('audio/ogg; codecs="vorbis"')?'ogg':'mp3';
let ambient=null,lastHover=0;
const play=(name,level=.7)=>{const value=settings();if(value.muted||!value.effectsEnabled)return;const audio=new Audio(audioUrl(name,extension));audio.volume=Math.min(1,value.masterVolume*value.effectsVolume*level);audio.play().catch(()=>{});};
const startAmbient=()=>{const value=settings();if(ambient||value.muted||!value.musicEnabled)return;ambient=new Audio(audioUrl('game-center-ambient',extension));ambient.loop=true;ambient.volume=Math.min(1,value.masterVolume*value.musicVolume*.75);ambient.play().catch(()=>{ambient=null;});};

export function initGameCenterAudio(){
  window.addEventListener('pointerdown',startAmbient,{once:true,capture:true});
  document.addEventListener('pointerover',event=>{const now=performance.now();if(now-lastHover<120)return;if(event.target.closest('.play-button')){lastHover=now;play('play-button-hover',.4);}else if(event.target.closest('.game-card')){lastHover=now;play('game-card-hover',.28);}});
  document.addEventListener('click',event=>{const playLink=event.target.closest('.play-button'),leaderboard=event.target.closest('.leaderboard-trophy'),back=event.target.closest('.back-link');if(playLink){event.preventDefault();play('play-button-click',.85);setTimeout(()=>location.href=playLink.href,150);}else if(leaderboard){event.preventDefault();play('leaderboard-open',.7);setTimeout(()=>location.href=leaderboard.href,130);}else if(back){event.preventDefault();play('navigation-back',.65);setTimeout(()=>location.href=back.href,120);}});
  window.addEventListener('vhht:sound-settings-change',()=>{if(!ambient)return;const value=settings();ambient.volume=value.muted||!value.musicEnabled?0:Math.min(1,value.masterVolume*value.musicVolume*.75);});
}
