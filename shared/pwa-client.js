const rootUrl = new URL("../", import.meta.url);
let installPrompt = null;
let pwaRegistration = null;
const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

function ensurePwaMetadata() {
  if (!document.querySelector('link[rel="manifest"]')) {
    const manifest = document.createElement("link");
    manifest.rel = "manifest";
    manifest.href = new URL("manifest.webmanifest", rootUrl).href;
    document.head.appendChild(manifest);
  }
  if (!document.querySelector('link[rel="apple-touch-icon"]')) {
    const appleIcon = document.createElement("link");
    appleIcon.rel = "apple-touch-icon";
    appleIcon.href = new URL("shared/assets/brand/vhht-logo-mark.png", rootUrl).href;
    document.head.appendChild(appleIcon);
  }
}

function ensurePwaStyles() {
  if (document.getElementById("vhht-pwa-styles")) return;
  const style = document.createElement("style");
  style.id = "vhht-pwa-styles";
  style.textContent = `html.vhht-wco-active body{box-sizing:border-box!important;padding-top:var(--vhht-wco-safe-top,0px)!important}html.vhht-wco-active body>.community-topbar,html.vhht-wco-active body>.profile-topbar{top:0!important}.vhht-pwa-banner{position:fixed;z-index:1000000;right:18px;bottom:max(18px,env(safe-area-inset-bottom));width:min(420px,calc(100vw - 28px));display:grid;grid-template-columns:42px minmax(0,1fr) auto auto;align-items:center;gap:11px;padding:12px;border:1px solid #347697;border-radius:16px;background:linear-gradient(145deg,#0b2842f5,#061729fa);box-shadow:0 20px 60px #000b;color:#e8f6ff;font-family:system-ui,sans-serif}.vhht-pwa-banner>i{width:42px;height:42px;display:grid;place-items:center;border-radius:12px;background:#123d5d;color:#68dcff}.vhht-pwa-banner span{display:grid;gap:3px}.vhht-pwa-banner strong{font-size:13px}.vhht-pwa-banner small{color:#89a5b8;font-size:10px;line-height:1.4}.vhht-pwa-banner button{padding:9px 11px;border:1px solid #4cccf4;border-radius:10px;background:#126181;color:#fff;font-weight:750;cursor:pointer}.vhht-pwa-banner button[data-close]{width:30px;padding:6px;border-color:transparent;background:transparent;color:#8da6b8}@media(max-width:560px){.vhht-pwa-banner{right:14px;left:14px;width:auto;bottom:max(12px,env(safe-area-inset-bottom));grid-template-columns:38px minmax(0,1fr) auto}.vhht-pwa-banner [data-action]{grid-column:2/3}.vhht-pwa-banner [data-close]{grid-column:3;grid-row:1}}`;
  document.head.appendChild(style);
}

function syncWindowControlsOverlay() {
  const overlay = navigator.windowControlsOverlay;
  if (!overlay) return;
  const update = () => {
    const visible = overlay.visible;
    const rect = overlay.getTitlebarAreaRect();
    document.documentElement.classList.toggle("vhht-wco-active", visible);
    document.documentElement.style.setProperty("--vhht-wco-safe-top", visible ? `${Math.max(0, rect.y + rect.height)}px` : "0px");
  };
  update();
  overlay.addEventListener("geometrychange", update);
}

function showBanner({ icon="fa-satellite-dish", title, message, action, onAction, dismiss=true, onDismiss }) {
  ensurePwaStyles();
  document.querySelector(".vhht-pwa-banner")?.remove();
  const banner=document.createElement("aside");banner.className="vhht-pwa-banner";banner.setAttribute("role","status");
  banner.innerHTML=`<i class="fa-solid ${icon}" aria-hidden="true"></i><span><strong></strong><small></small></span>${action?'<button type="button" data-action></button>':''}${dismiss?'<button type="button" data-close aria-label="Đóng">×</button>':''}`;
  banner.querySelector("strong").textContent=title;banner.querySelector("small").textContent=message;
  const actionButton=banner.querySelector("[data-action]");if(actionButton){actionButton.textContent=action;actionButton.onclick=onAction}
  banner.querySelector("[data-close]")?.addEventListener("click",()=>{onDismiss?.();banner.remove()});document.body.appendChild(banner);return banner;
}

async function registerPwa() {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
  const registration=await navigator.serviceWorker.register(new URL("../service-worker.js",import.meta.url),{scope:rootUrl.pathname});
  pwaRegistration = registration;
  registration.addEventListener("updatefound",()=>{const worker=registration.installing;if(!worker)return;worker.addEventListener("statechange",()=>{if(worker.state==="installed"&&navigator.serviceWorker.controller)showBanner({icon:"fa-arrow-rotate-right",title:"Có phiên bản VHHT mới",message:"Cập nhật đã sẵn sàng và không làm mất dữ liệu đang lưu trên máy chủ.",action:"Cập nhật",onAction:()=>worker.postMessage({type:"VHHT_SKIP_WAITING"})})})});
  navigator.serviceWorker.addEventListener("controllerchange",()=>location.reload());
  return registration;
}

async function requestUpdate() {
  const status = document.querySelector('[data-pwa-update-status]');
  const setStatus = message => { if (status) status.textContent = message; };
  if (!("serviceWorker" in navigator) || !window.isSecureContext) {
    setStatus("Thiết bị hoặc kết nối hiện tại không hỗ trợ cập nhật ứng dụng.");
    return "unsupported";
  }
  setStatus("Đang kiểm tra phiên bản mới…");
  const registration = pwaRegistration || await registerPwa();
  await registration.update();
  const worker = registration.waiting || registration.installing;
  if (worker) {
    setStatus("Đã tìm thấy phiên bản mới. Đang hoàn tất cập nhật…");
    if (worker.state === "installed") worker.postMessage({ type: "VHHT_SKIP_WAITING" });
    else worker.addEventListener("statechange", () => {
      if (worker.state === "installed") worker.postMessage({ type: "VHHT_SKIP_WAITING" });
    });
    return "updating";
  }
  setStatus("Bạn đang dùng phiên bản mới nhất.");
  return "current";
}

const isIosDevice = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
  || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

function showIosInstallGuide() {
  ensurePwaStyles();
  if (!document.getElementById("vhht-ios-install-styles")) {
    const style = document.createElement("style");
    style.id = "vhht-ios-install-styles";
    style.textContent = `.vhht-ios-install-overlay{position:fixed;z-index:2147483600;inset:0;display:grid;place-items:center;padding:max(18px,env(safe-area-inset-top)) 16px max(18px,env(safe-area-inset-bottom));background:rgba(1,6,17,.8);backdrop-filter:blur(10px);font-family:system-ui,sans-serif}.vhht-ios-install-dialog{width:min(420px,100%);padding:20px;border:1px solid #3184aa;border-radius:22px;background:linear-gradient(150deg,#0b2842,#061426);box-shadow:0 28px 80px #000c;color:#eaf8ff}.vhht-ios-install-dialog header{display:flex;align-items:center;gap:12px}.vhht-ios-install-dialog header i{width:44px;height:44px;display:grid;place-items:center;flex:none;border-radius:13px;background:#123d5d;color:#70e2ff;font-size:20px}.vhht-ios-install-dialog header span{display:grid;gap:3px}.vhht-ios-install-dialog header small,.vhht-ios-install-dialog>p{color:#91adbf;line-height:1.5}.vhht-ios-install-dialog ol{display:grid;gap:12px;margin:18px 0;padding:0;list-style:none;counter-reset:install}.vhht-ios-install-dialog li{display:grid;grid-template-columns:30px 1fr;align-items:center;gap:10px;color:#dcecf6;line-height:1.45}.vhht-ios-install-dialog li:before{counter-increment:install;content:counter(install);width:30px;height:30px;display:grid;place-items:center;border-radius:50%;background:#124766;color:#8cecff;font-weight:800}.vhht-ios-install-dialog button{width:100%;min-height:46px;border:1px solid #42bde8;border-radius:12px;background:#125475;color:white;font-weight:800}.vhht-ios-install-dialog button:focus-visible{outline:3px solid #67e8f9;outline-offset:3px}`;
    document.head.appendChild(style);
  }
  document.querySelector(".vhht-ios-install-overlay")?.remove();
  const chromeIos = /CriOS/i.test(navigator.userAgent);
  const overlay = document.createElement("div");
  overlay.className = "vhht-ios-install-overlay";
  overlay.innerHTML = `<section class="vhht-ios-install-dialog" role="dialog" aria-modal="true" aria-labelledby="vhht-ios-install-title"><header><i class="fa-solid fa-mobile-screen-button" aria-hidden="true"></i><span><strong id="vhht-ios-install-title">Cài VHHT trên iPhone</strong><small>iOS yêu cầu xác nhận trong menu trình duyệt.</small></span></header><ol><li>${chromeIos ? "Nhấn nút ⋯ rồi chọn Chia sẻ." : "Nhấn nút Chia sẻ của Safari."}</li><li>Chọn “Thêm vào Màn hình chính”.</li><li>Nhấn “Thêm” để hoàn tất.</li></ol><p>Nếu không có lựa chọn này, hãy mở trang bằng Safari rồi thử lại.</p><button type="button">Đã hiểu</button></section>`;
  const close = () => overlay.remove();
  overlay.querySelector("button").addEventListener("click", close);
  overlay.addEventListener("click", event => { if (event.target === overlay) close(); });
  document.body.appendChild(overlay);
  overlay.querySelector("button").focus();
}

async function requestInstall() {
  if (isStandalone()) {
    showBanner({ icon:"fa-circle-check", title:"VHHT đã được cài đặt", message:"Bạn đang sử dụng phiên bản ứng dụng trên thiết bị này." });
    return "installed";
  }
  if (isIosDevice()) {
    showIosInstallGuide();
    return "instructions";
  }
  if (installPrompt) {
    const prompt = installPrompt;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") installPrompt = null;
    return choice.outcome;
  }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  showBanner({
    icon:"fa-mobile-screen-button",
    title:"Cài VHHT trên thiết bị",
    message: ios
      ? "Mở menu Chia sẻ của Safari rồi chọn Thêm vào Màn hình chính."
      : "Mở menu của Chrome hoặc Edge và chọn Cài đặt ứng dụng / Cài đặt VHHT.",
    dismiss:true
  });
  return "unavailable";
}

window.VHHTPWA = Object.freeze({ install: requestInstall, update: requestUpdate, isInstalled: isStandalone });
document.addEventListener("click", event => {
  const updateButton = event.target.closest("[data-pwa-update]");
  if (updateButton) {
    updateButton.disabled = true;
    requestUpdate().catch(error => {
      const status = document.querySelector('[data-pwa-update-status]');
      if (status) status.textContent = "Không thể kiểm tra cập nhật. Hãy kiểm tra mạng rồi thử lại.";
      console.warn("Không thể cập nhật PWA", error);
    }).finally(() => { updateButton.disabled = false; });
    return;
  }
  const button = event.target.closest("[data-pwa-install]");
  if (!button) return;
  const api = window.parent !== window && window.parent.VHHTPWA ? window.parent.VHHTPWA : window.VHHTPWA;
  api.install();
});

window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();installPrompt=event;window.dispatchEvent(new CustomEvent("vhht:pwa-install-ready"));if(sessionStorage.getItem("vhht-pwa-install-dismissed"))return;showBanner({icon:"fa-mobile-screen-button",title:"Cài VHHT trên thiết bị",message:"Mở nhanh như một ứng dụng và nhận cập nhật có kiểm soát.",action:"Cài đặt",onDismiss:()=>sessionStorage.setItem("vhht-pwa-install-dismissed","1"),onAction:async()=>{await requestInstall();document.querySelector(".vhht-pwa-banner")?.remove()}})});
window.addEventListener("appinstalled",()=>{installPrompt=null;showBanner({icon:"fa-circle-check",title:"Đã cài VHHT",message:"Ứng dụng đã sẵn sàng trên thiết bị của bạn."})});
window.addEventListener("offline",()=>showBanner({icon:"fa-wifi",title:"Bạn đang ngoại tuyến",message:"Các thao tác cần Firebase sẽ tạm dừng cho tới khi có mạng."}));
window.addEventListener("online",()=>showBanner({icon:"fa-signal",title:"Đã kết nối lại",message:"VHHT có thể tiếp tục đồng bộ dữ liệu mới."}));

ensurePwaMetadata();
ensurePwaStyles();
syncWindowControlsOverlay();
registerPwa().catch(error=>console.warn("Không thể khởi tạo PWA",error));
