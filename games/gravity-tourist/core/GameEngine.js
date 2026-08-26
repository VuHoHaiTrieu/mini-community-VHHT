import { WORLD, GAME_CONFIG } from '../config/game-config.js';
import { UFO } from '../entities/UFO.js';
import { Debris } from '../entities/Debris.js';
import { enterOrbit, updateOrbit } from '../systems/OrbitSystem.js';
import { launch } from '../systems/LaunchSystem.js';
import { updateTravel } from '../systems/GravitySystem.js';
import { findCollision } from '../systems/CollisionSystem.js';
import { getDifficulty } from '../systems/DifficultySystem.js';
import { SpawnSystem } from '../systems/SpawnSystem.js';
import { ScoreSystem } from '../systems/ScoreSystem.js';

export class GameEngine extends EventTarget {
  constructor() { super(); this.ufo = new UFO(); this.scoreSystem = new ScoreSystem(); this.reset(); }
  reset() {
    this.elapsed = 0; this.approaches = 0; this.cameraX = 0; this.alive = true; this.newBest = false; this.defenseCooldown = 3; this.frontierX = 0;
    this.spawn = new SpawnSystem(); this.bodies = this.spawn.initial(); this.debris = [];
    this.ufo.reset(); this.scoreSystem.reset(); this.difficulty = getDifficulty(0, 0);
    const start = this.bodies[0]; this.frontierX = start.x; this.ufo.x = start.x - start.orbitRadius; this.ufo.y = start.y;
    enterOrbit(this.ufo, start, 'good'); this.addNextRoutes(start);
  }
  addNextRoutes(body) {
    const routes = this.spawn.spawnRoutes(body, this.difficulty);
    this.bodies.push(...routes); this.debris.push(...this.spawn.spawnDebris(body, routes, this.difficulty));
  }
  launch() { return this.alive && launch(this.ufo, this.difficulty, this.bodies); }
  update(dt) {
    if (!this.alive) return;
    this.elapsed += dt; this.difficulty = getDifficulty(this.approaches, this.elapsed);
    this.ufo.boostTime = Math.max(0, this.ufo.boostTime - dt);
    if (this.ufo.mode === 'orbit') updateOrbit(this.ufo, dt, this.difficulty);
    else {
      this.ufo.travelTime += dt;
      updateTravel(this.ufo, this.bodies, dt);
      if (this.ufo.ignoredBody && Math.hypot(this.ufo.x - this.ufo.ignoredBody.x, this.ufo.y - this.ufo.ignoredBody.y) > this.ufo.ignoredBody.captureRadius * 1.2) this.ufo.ignoredBody = null;
    }
    for (const item of this.debris) item.update(dt);
    this.updateEarthDefense(dt);
    this.debris = this.debris.filter(item => !['human','energy','laser'].includes(item.kind) || (item.x > this.cameraX - 230 && item.x < this.cameraX + WORLD.width + 760));
    this.rememberTrail(); this.scoreSystem.update(dt);
    const hit = findCollision(this.ufo, this.bodies, this.debris);
    if (hit?.type === 'capture') this.capture(hit.body, hit.quality);
    else if (hit) this.gameOver(hit.type === 'debris' ? 'SPACE DEBRIS COLLISION' : hit.type === 'defense' ? 'EARTH DEFENSE INTERCEPTED' : 'TOURIST IMPACT');
    if (this.ufo.mode === 'travel' && this.ufo.travelTime > .72 && !this.hasReachableOrbit()) this.gameOver('NO GRAVITY PATH');
    if (this.ufo.x < this.cameraX - GAME_CONFIG.missMargin || this.ufo.y < -GAME_CONFIG.missMargin || this.ufo.y > WORLD.height + GAME_CONFIG.missMargin) this.gameOver('LOST IN SPACE');
    const desiredCamera = Math.max(0, this.ufo.x - WORLD.width * .33);
    this.cameraX += (desiredCamera - this.cameraX) * Math.min(1, dt * 2.6);
    this.dispatchEvent(new CustomEvent('tick'));
  }
  hasReachableOrbit() {
    const speed2=this.ufo.vx*this.ufo.vx+this.ufo.vy*this.ufo.vy;if(speed2<1)return true;
    return this.bodies.some(body=>{if(body===this.ufo.ignoredBody)return false;const dx=body.x-this.ufo.x,dy=body.y-this.ufo.y,distance=Math.hypot(dx,dy);return distance<680&&dx*this.ufo.vx+dy*this.ufo.vy>0;});
  }
  updateEarthDefense(dt) {
    if (this.difficulty.progress < .28 || this.ufo.mode !== 'travel') return;
    this.defenseCooldown -= dt;
    if (this.defenseCooldown > 0) return;
    const intensity = this.difficulty.progress;
    this.defenseCooldown = Math.max(.48, 3.35 - intensity * 2.75) + Math.random() * .75;
    const salvo = intensity > .82 ? 2 : 1;
    for(let shot=0;shot<salvo;shot++){
      const originX=this.ufo.x+470+Math.random()*180,originY=45+Math.random()*(WORLD.height-90),prediction=.45+intensity*.55,targetY=Math.max(24,Math.min(WORLD.height-24,this.ufo.y+this.ufo.vy*prediction)),dx=this.ufo.x-originX,dy=targetY-originY,length=Math.max(1,Math.hypot(dx,dy));
      const kind=intensity>.68?(Math.random()>.5?'laser':'energy'):intensity>.45?'energy':'human',speed=(kind==='laser'?510:kind==='energy'?400:300)+intensity*180;
      this.debris.push(new Debris(originX+shot*28,originY+shot*18,kind==='laser'?7:kind==='energy'?10:9,0,0,kind,dx/length*speed,dy/length*speed));
    }
  }
  rememberTrail() {
    this.ufo.trail.push({ x: this.ufo.x, y: this.ufo.y });
    if (this.ufo.trail.length > GAME_CONFIG.trailLength) this.ufo.trail.shift();
  }
  capture(body, quality) {
    if (body === this.bodies[0] && this.approaches === 0) return;
    const advancesFrontier = body.x > this.frontierX + 18;
    if (advancesFrontier) { this.frontierX = body.x; this.approaches++; this.scoreSystem.capture(body, quality); }
    else this.scoreSystem.noProgress();
    enterOrbit(this.ufo, body, quality);
    this.ufo.ignoredBody = null;
    if (advancesFrontier) { this.bodies = this.bodies.filter(item => item.x > body.x - 150 || item === body); this.debris = this.debris.filter(item => item.x > body.x - 180); if (!this.bodies.some(item => item.x > body.x + 170)) this.addNextRoutes(body); }
    this.dispatchEvent(new CustomEvent('capture', { detail: { quality, scored: advancesFrontier } }));
  }
  gameOver(reason) { if (!this.alive) return; this.alive = false; this.dispatchEvent(new CustomEvent('gameover', { detail: { reason } })); }
  snapshot() { return { score: this.scoreSystem.score, combo: this.scoreSystem.combo, bestCombo: this.scoreSystem.bestCombo, perfect: this.scoreSystem.perfect, message: this.scoreSystem.messageTime > 0 ? this.scoreSystem.message : '', elapsed: this.elapsed, approaches: this.approaches, alert: this.difficulty.alert }; }
}
