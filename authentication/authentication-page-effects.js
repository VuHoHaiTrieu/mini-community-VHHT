const loader=document.createElement("div");
loader.className="auth-page-loader";
loader.innerHTML='<div class="auth-loader-orbit"><i class="fa-solid fa-satellite-dish"></i><span></span><span></span></div><strong>Đang bắt tín hiệu VHHT</strong><small>Thiết lập kết nối an toàn...</small>';
document.body.appendChild(loader);
requestAnimationFrame(()=>requestAnimationFrame(()=>document.body.classList.add("auth-interface-ready")));
setTimeout(()=>loader.remove(),850);
document.querySelectorAll(".authentication-input").forEach((input,index)=>input.style.setProperty("--field-index",index));
