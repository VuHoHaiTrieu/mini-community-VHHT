// Keep the application viewport stable on touch devices. Inputs remain scrollable
// and selectable, while accidental double-tap and pinch page zoom are suppressed.
if(!window.__vhhtMobileGestureGuard){
window.__vhhtMobileGestureGuard=true;
let lastTouchEnd=0;
document.addEventListener("gesturestart",event=>event.preventDefault(),{passive:false});
document.addEventListener("touchend",event=>{
  const now=Date.now();
  if(now-lastTouchEnd<320&&!event.target.closest("input,textarea,select"))event.preventDefault();
  lastTouchEnd=now;
},{passive:false});
document.addEventListener("touchmove",event=>{if(event.touches.length>1)event.preventDefault()},{passive:false});
}
