import { NOVA_CONFIG } from '../config/nova.config.js';

const STORAGE_KEY='vhht_ai_character';
const allowed=new Set(Object.keys(NOVA_CONFIG.characters));

class NovaCharacterManager extends EventTarget {
  constructor(){
    super();
    let saved='nova';
    try{saved=localStorage.getItem(STORAGE_KEY)||'nova'}catch(_){}
    this.current=allowed.has(saved)?saved:'nova';
  }
  getCharacter(){return this.current}
  getDefinition(id=this.current){return NOVA_CONFIG.characters[id]||NOVA_CONFIG.characters.nova}
  setCharacter(id){
    const next=String(id||'').toLowerCase();
    if(!allowed.has(next))throw new TypeError(`Nhân vật AI không hợp lệ: ${id}`);
    if(next===this.current)return this.getDefinition();
    this.current=next;
    try{localStorage.setItem(STORAGE_KEY,next)}catch(_){}
    const detail={id:next,character:this.getDefinition(next)};
    this.dispatchEvent(new CustomEvent('change',{detail}));
    window.dispatchEvent(new CustomEvent('nova:character-change',{detail}));
    return detail.character;
  }
  subscribe(listener){
    const handler=event=>listener(event.detail);
    this.addEventListener('change',handler);
    return()=>this.removeEventListener('change',handler);
  }
}

export const novaCharacters=new NovaCharacterManager();
