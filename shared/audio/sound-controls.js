import { soundManager, playUiSound, playBackgroundMusic, stopBackgroundMusic } from "./sound-manager.js";

const isCommunityFeed = document.body.classList.contains("community-feed-page")
  || /community-feed-page\.html$/i.test(location.pathname);

const dock = document.createElement("section");
dock.className = "vhht-sound-dock";
dock.setAttribute("aria-label", "Cài đặt âm thanh");
dock.innerHTML = `
  <button class="vhht-sound-trigger" type="button" aria-label="Mở cài đặt âm thanh" aria-expanded="false">
    <i class="fa-solid fa-volume-high" aria-hidden="true"></i>
  </button>
  <div class="vhht-sound-popover" role="dialog" aria-modal="false" aria-label="Cài đặt âm thanh" hidden>
    <header><div><h2>Âm thanh</h2><p>Điều chỉnh riêng cho thiết bị này</p></div><button class="vhht-sound-close" type="button" aria-label="Đóng"><i class="fa-solid fa-xmark"></i></button></header>
    <div class="vhht-sound-row"><div class="vhht-sound-copy"><span class="vhht-sound-effect-icon" aria-hidden="true"><svg viewBox="0 0 32 32" focusable="false"><path class="vhht-effect-speaker" d="M6.5 13h4.2l5.2-4.2v14.4L10.7 19H6.5z"/><path class="vhht-effect-wave" d="M19.2 12.1c1.2 1 1.8 2.3 1.8 3.9s-.6 2.9-1.8 3.9M22.3 9.4c2 1.7 3.1 3.9 3.1 6.6s-1.1 4.9-3.1 6.6"/><path class="vhht-effect-spark" d="M25.5 4.4v3.8M23.6 6.3h3.8"/></svg></span><span>Hiệu ứng<small>Phản hồi khi thao tác</small></span></div><button class="vhht-sound-switch" type="button" role="switch" data-setting="effectsEnabled" aria-label="Bật hiệu ứng âm thanh"></button></div>
    ${isCommunityFeed ? `<div class="vhht-sound-row"><div class="vhht-sound-copy"><i class="fa-solid fa-wave-square"></i><span>Không gian nền<small>Ambient nhẹ của bảng tin</small></span></div><button class="vhht-sound-switch" type="button" role="switch" data-setting="musicEnabled" aria-label="Bật âm thanh nền"></button></div>` : ""}
    <div class="vhht-sound-row"><div class="vhht-sound-copy"><i class="fa-solid fa-volume-high"></i><span>Âm thanh<small>Bật hoặc tắt toàn bộ</small></span></div><button class="vhht-sound-switch" type="button" role="switch" data-setting="muted" aria-label="Bật âm thanh"></button></div>
    <div class="vhht-sound-volume"><label for="vhht-sound-volume">Âm lượng chung <output></output></label><input id="vhht-sound-volume" type="range" min="0" max="1" step="0.05"></div>
  </div>`;
document.body.append(dock);

const trigger = dock.querySelector(".vhht-sound-trigger");
const popover = dock.querySelector(".vhht-sound-popover");
const volume = dock.querySelector("input[type=range]");
const output = dock.querySelector("output");

function render() {
  const settings = soundManager.settings;
  trigger.dataset.muted = String(settings.muted || (!settings.effectsEnabled && (!isCommunityFeed || !settings.musicEnabled)));
  trigger.querySelector("i").className = `fa-solid ${trigger.dataset.muted === "true" ? "fa-volume-xmark" : "fa-volume-high"}`;
  dock.querySelectorAll("[data-setting]").forEach(button => {
    const enabled = button.dataset.setting === "muted" ? !settings.muted : Boolean(settings[button.dataset.setting]);
    button.setAttribute("aria-checked", String(enabled));
  });
  volume.value = String(settings.masterVolume);
  output.textContent = `${Math.round(settings.masterVolume * 100)}%`;
}

function setOpen(open) {
  if (popover.hidden === !open) return;
  popover.hidden = !open;
  trigger.setAttribute("aria-expanded", String(open));
  playUiSound(open ? "open" : "close");
  if (open) dock.querySelector(".vhht-sound-close")?.focus({ preventScroll: true });
}

trigger.addEventListener("click", () => setOpen(popover.hidden));
dock.querySelector(".vhht-sound-close").addEventListener("click", () => setOpen(false));
dock.querySelectorAll("[data-setting]").forEach(button => button.addEventListener("click", async () => {
  await soundManager.unlock();
  const key = button.dataset.setting;
  if (key === "muted") soundManager.setMuted(!soundManager.settings.muted);
  else soundManager.updateSettings({ [key]: !soundManager.settings[key] });
  if (key === "musicEnabled") {
    if (soundManager.settings.musicEnabled) playBackgroundMusic();
    else stopBackgroundMusic({ remember: false });
  }
  playUiSound("toggle");
  render();
}));
volume.addEventListener("input", () => { soundManager.setMasterVolume(volume.value); render(); });
soundManager.addEventListener("settingschange", render);

if (isCommunityFeed) {
  soundManager.ambientRequested = true;
  // Thử phát ngay khi trang sẵn sàng. Trình duyệt nào chặn autoplay sẽ được
  // tiếp tục tự động ở tương tác đầu tiên thông qua cơ chế unlock bên dưới.
  soundManager.unlock().then(() => {
    if (soundManager.settings.musicEnabled && !soundManager.settings.muted) playBackgroundMusic();
  }).catch(() => {});
  soundManager.addEventListener("unlock", () => {
    if (soundManager.settings.musicEnabled && !soundManager.settings.muted) playBackgroundMusic();
  });
}

soundManager.preload();
render();

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !popover.hidden) setOpen(false);
});
document.addEventListener("pointerdown", event => {
  if (!popover.hidden && !dock.contains(event.target)) setOpen(false);
});

// Chỉ phần tử được đánh dấu rõ ràng mới phát âm thanh, không bắt click toàn trang.
const bound = new WeakSet();
function bindMarkedSounds(root = document) {
  root.querySelectorAll?.("[data-ui-sound]").forEach(element => {
    if (bound.has(element)) return;
    bound.add(element);
    element.addEventListener("click", () => playUiSound(element.dataset.uiSound || "soft"));
  });
}
bindMarkedSounds();
new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
  if (node.nodeType === Node.ELEMENT_NODE) bindMarkedSounds(node);
}))).observe(document.body, { childList: true, subtree: true });
