import { NOVA_CONFIG } from '../../config/nova.config.js';
import { novaCharacters } from '../../services/novaCharacterManager.js';

const THREE_URL=new URL('../../vendor/three.module.js',import.meta.url).href;
const LOADER_URL=new URL('../../vendor/GLTFLoader.js',import.meta.url).href;

export class Nova3DAnimation {
  constructor(container){
    this.container=container;this.state='idle';this.disposed=false;this.loadToken=0;this.lookX=0;this.lookY=0;
    this.canvas=document.createElement('canvas');this.canvas.className='nova-animation-canvas nova-animation-canvas--3d';
    this.fallback=document.createElement('span');this.fallback.className='nova-3d-loader';this.fallback.setAttribute('aria-hidden','true');
    this.fallback.innerHTML='<i class="fa-solid fa-robot"></i>';
    container.append(this.canvas,this.fallback);
    this.onContextLost=event=>{event.preventDefault();this.fallback.hidden=false;this.container.classList.remove('is-ready-3d')};
    this.canvas.addEventListener('webglcontextlost',this.onContextLost,false);
    this.unsubscribe=novaCharacters.subscribe(()=>this.loadCharacter());
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(container);
    this.pointerMove=event=>{const rect=container.getBoundingClientRect();this.lookX=((event.clientX-rect.left)/Math.max(rect.width,1)-.5)*.34;this.lookY=((event.clientY-rect.top)/Math.max(rect.height,1)-.5)*.18};
    this.pointerLeave=()=>{this.lookX=0;this.lookY=0};container.addEventListener('pointermove',this.pointerMove,{passive:true});container.addEventListener('pointerleave',this.pointerLeave,{passive:true});
    this.init();
  }
  async init(){
    try{
      const [THREE,{GLTFLoader}]=await Promise.all([import(THREE_URL),import(LOADER_URL)]);
      if(this.disposed)return;
      this.THREE=THREE;this.loader=new GLTFLoader();
      this.renderer=new THREE.WebGLRenderer({canvas:this.canvas,alpha:true,antialias:true,powerPreference:'low-power'});
      this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.6));this.renderer.setClearColor(0x000000,0);
      this.renderer.outputColorSpace=THREE.SRGBColorSpace;
      this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(27,1,.1,100);this.camera.position.set(0,0,7.2);this.camera.lookAt(0,0,0);
      this.scene.add(new THREE.HemisphereLight(0xdff7ff,0x16213f,2.6));
      const key=new THREE.DirectionalLight(0xffffff,3.2);key.position.set(3,-4,6);this.scene.add(key);
      const rim=new THREE.DirectionalLight(0x3ccfff,2.2);rim.position.set(-4,3,2);this.scene.add(rim);
      this.createEffects();
      this.clock=new THREE.Clock();this.resize();await this.loadCharacter();this.animate();
    }catch(error){this.fail(error)}
  }
  async loadCharacter(){
    if(!this.loader)return;
    const token=++this.loadToken,definition=novaCharacters.getDefinition();
    if(!this.model)this.fallback.hidden=false;
    this.container.classList.toggle('is-loading-3d',!this.model);
    try{
      const gltf=await this.loader.loadAsync(definition.modelUrl);
      if(this.disposed||token!==this.loadToken)return;
      const nextModel=gltf.scene,nextMixer=new this.THREE.AnimationMixer(nextModel),nextClips=new Map();
      gltf.animations.forEach(clip=>nextClips.set(clip.name.toLowerCase().replace(/[^a-z]/g,''),clip));
      const clipKey=String(this.state).toLowerCase().replace(/[^a-z]/g,''),initialClip=nextClips.get(clipKey)||nextClips.get('idle');
      let nextAction=null;if(initialClip){nextAction=nextMixer.clipAction(initialClip);nextAction.reset().setLoop(this.THREE.LoopRepeat,Infinity).play()}
      nextMixer.update(0);nextModel.updateMatrixWorld(true);
      // Blender's animated skinned parts can have conservative local bounds
      // that Three.js incorrectly culls in this very small overlay canvas.
      nextModel.traverse(object=>{if(object.isMesh||object.isSkinnedMesh)object.frustumCulled=false});
      // Animation clips keyframe the GLB Root. Viewport transforms therefore
      // live on this unanimated parent and can never be overwritten.
      const anchor=new this.THREE.Group();anchor.name='VHHTMascotViewportAnchor';anchor.add(nextModel);
      const box=new this.THREE.Box3().setFromObject(nextModel),size=box.getSize(new this.THREE.Vector3()),center=box.getCenter(new this.THREE.Vector3());
      nextModel.position.sub(center);anchor.scale.setScalar(3.25/Math.max(size.y,.001));anchor.position.y=.08;anchor.rotation.x=.02;anchor.updateMatrixWorld(true);
      this.scene.add(anchor);
      const oldModel=this.model;if(oldModel)this.scene.remove(oldModel);
      this.model=anchor;this.animatedModel=nextModel;this.mixer=nextMixer;this.clips=nextClips;this.action=nextAction;
      if(oldModel)this.disposeObject(oldModel);this.updateEffects();
      // Draw a valid first pose before removing the image fallback. Without
      // this, the canvas can briefly contain only the energy ring on startup.
      this.renderer.render(this.scene,this.camera);
      this.container.classList.remove('is-loading-3d');this.container.classList.add('is-ready-3d');
      requestAnimationFrame(()=>{if(!this.disposed&&token===this.loadToken)this.fallback.hidden=true});
    }catch(error){this.fail(error)}
  }
  setState(state){this.state=state||'idle';if(this.mixer)this.play(this.state);this.updateEffects()}
  createEffects(){
    const THREE=this.THREE,positions=[];for(let index=0;index<28;index++){const angle=index*2.399;const radius=.9+(index%7)*.11;positions.push(Math.cos(angle)*radius,(index%9)*.24-1.0,Math.sin(angle)*.28)}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    this.particleMaterial=new THREE.PointsMaterial({color:0x39d9ff,size:.075,transparent:true,opacity:.85,depthWrite:false,blending:THREE.AdditiveBlending});
    this.particles=new THREE.Points(geometry,this.particleMaterial);this.scene.add(this.particles);
    this.energyRing=new THREE.Mesh(new THREE.TorusGeometry(1.15,.025,8,64),new THREE.MeshBasicMaterial({color:0x28d9ff,transparent:true,opacity:.52,blending:THREE.AdditiveBlending}));
    this.energyRing.rotation.x=Math.PI/2;this.energyRing.position.y=-1.34;this.scene.add(this.energyRing);
  }
  updateEffects(){
    if(!this.particles)return;const definition=novaCharacters.getDefinition(),color=new this.THREE.Color(definition.accent||'#21d4fd');this.particleMaterial.color.copy(color);this.energyRing.material.color.copy(color);
    const energetic=['searching','happy','celebrate','dance','create'].includes(this.state);this.particles.visible=this.state!=='sleeping';this.particleMaterial.opacity=energetic ? .95 : .42;this.particleMaterial.size=energetic ? .105 : .065;this.energyRing.material.opacity=energetic ? .78 : .34;
  }
  play(name,immediate=false){
    const clip=this.clips?.get(String(name).toLowerCase().replace(/[^a-z]/g,''))||this.clips?.get('idle');if(!clip)return;
    const next=this.mixer.clipAction(clip);next.reset().setLoop(this.THREE.LoopRepeat,Infinity).play();
    if(this.action&&this.action!==next){immediate?this.action.stop():this.action.crossFadeTo(next,.24,false)}this.action=next;
  }
  animate=()=>{
    if(this.disposed)return;
    this.frame=requestAnimationFrame(this.animate);
    if(document.hidden||!this.renderer)return;
    this.mixer?.update(Math.min(this.clock.getDelta(),.05));
    const elapsed=this.clock.elapsedTime;if(this.model){this.model.rotation.y+=(this.lookX-this.model.rotation.y)*.055;this.model.rotation.x+=(.02-this.lookY-this.model.rotation.x)*.055}
    if(this.particles){this.particles.rotation.y+=.008*(this.state==='searching'?3:1);this.particles.position.y=Math.sin(elapsed*1.8)*.06}
    if(this.energyRing){this.energyRing.rotation.z+=.006*(this.state==='happy'||this.state==='celebrate'?3:1);const pulse=1+Math.sin(elapsed*3)*.035;this.energyRing.scale.setScalar(pulse)}
    this.renderer.render(this.scene,this.camera);
  };
  resize(){
    if(!this.renderer)return;const width=Math.max(1,this.container.clientWidth),height=Math.max(1,this.container.clientHeight);
    this.renderer.setSize(width,height,false);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();
  }
  fail(error){console.warn('[NOVA 3D] Dùng ảnh fallback.',error);this.container.classList.remove('is-loading-3d');this.fallback.hidden=false}
  disposeObject(root){root?.traverse?.(object=>{object.geometry?.dispose?.();const materials=Array.isArray(object.material)?object.material:[object.material];materials.filter(Boolean).forEach(mat=>mat.dispose?.())})}
  destroy(){this.disposed=true;cancelAnimationFrame(this.frame);this.unsubscribe?.();this.resizeObserver?.disconnect();this.container.removeEventListener('pointermove',this.pointerMove);this.container.removeEventListener('pointerleave',this.pointerLeave);this.canvas.removeEventListener('webglcontextlost',this.onContextLost);this.mixer?.stopAllAction();if(this.model)this.disposeObject(this.model);this.disposeObject(this.particles);this.disposeObject(this.energyRing);this.renderer?.dispose();this.canvas.remove();this.fallback.remove()}
}
