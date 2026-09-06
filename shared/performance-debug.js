export function startPerformanceDebug() {
  if (document.getElementById("vhht-performance-debug")) return;
  const panel=document.createElement("output");panel.id="vhht-performance-debug";
  Object.assign(panel.style,{position:"fixed",left:"8px",top:"8px",zIndex:"2147483647",padding:"7px 9px",border:"1px solid #48ddff",borderRadius:"8px",background:"rgba(1,8,20,.9)",color:"#aef5ff",font:"11px/1.45 ui-monospace,monospace",whiteSpace:"pre",pointerEvents:"none"});
  document.body.appendChild(panel);
  let frames=0,last=performance.now(),fps=0,frameMs=0,raf=0;
  const sample=now=>{frames+=1;if(now-last>=500){fps=frames*1000/(now-last);frameMs=(now-last)/frames;frames=0;last=now}raf=requestAnimationFrame(sample)};
  raf=requestAnimationFrame(sample);
  const render=()=>{const feed=window.__VHHT_FEED_PERF__||{},messages=window.__VHHT_MESSAGES_PERF__||{},game=window.__VHHT_GAME_PERF__||{};panel.textContent=`FPS ${fps.toFixed(1)} · ${frameMs.toFixed(1)} ms\nFeed scheduler ${feed.running?1:0} · cards ${feed.cards??document.querySelectorAll('.community-post-card,.feed-list-post').length}\nMessages live ${messages.recentRealtime??0} · loaded ${messages.loaded??0} · DOM ${messages.dom??document.querySelectorAll('.message-row[data-message-id]').length}\nListeners ${messages.listeners??0} · older ${messages.hasOlder?'yes':'no'}\nEntities ${(game.bodies??0)+(game.debris??0)} · quality ${game.quality||document.documentElement.dataset.gamePerformance||document.documentElement.dataset.performanceTier||'full'}\nDOM ${document.getElementsByTagName('*').length}`};
  const timer=setInterval(render,500);render();
  addEventListener("pagehide",()=>{cancelAnimationFrame(raf);clearInterval(timer)},{once:true});
}
