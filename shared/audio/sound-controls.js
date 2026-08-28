import { soundManager, playUiSound, playBackgroundMusic, stopBackgroundMusic } from "./sound-manager.js?v=6";
import "../performance-governor.js?v=3";
// Bind semantic sounds once for real interactive controls on every page that
// loads the shared sound controls. The module has its own duplicate guard.
import "./sound-clicks.js?v=3";

const isCommunityFeed = document.body.classList.contains("community-feed-page")
  || /community-feed-page\.html$/i.test(location.pathname);

const dock = document.createElement("section");
dock.className = "vhht-sound-dock";
dock.hidden = true;
dock.style.display = "none";
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
  playUiSound(open ? "open-panel" : "close-panel");
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
  const enabled = key === "muted" ? !soundManager.settings.muted : Boolean(soundManager.settings[key]);
  playUiSound(enabled ? "toggle-on" : "toggle-off");
  render();
}));
volume.addEventListener("input", () => { soundManager.setMasterVolume(volume.value); render(); });
soundManager.addEventListener("settingschange", render);

if (isCommunityFeed) {
  soundManager.ambientRequested = true;
  // Thử phát ngay khi trang sẵn sàng. Trình duyệt nào chặn autoplay sẽ được
  // tiếp tục tự động ở tương tác đầu tiên thông qua cơ chế unlock bên dưới.
  soundManager.addEventListener("unlock", () => {
    if (soundManager.settings.musicEnabled && !soundManager.settings.muted) playBackgroundMusic();
  });
}

soundManager.preload();
render();

// Mobile browsers require one trusted gesture before audible playback. Unlock in
// capture phase so the very first control click can already use its UI sound.
const primeAudio = () => {
  soundManager.unlock().then(() => {
    if (isCommunityFeed && soundManager.settings.musicEnabled && !soundManager.settings.muted) playBackgroundMusic();
  }).catch(() => {});
};
window.addEventListener("pointerdown", primeAudio, { capture:true, passive:true });
window.addEventListener("touchend", primeAudio, { capture:true, passive:true });
window.addEventListener("pageshow", () => {
  if (soundManager.unlocked && isCommunityFeed && soundManager.settings.musicEnabled && !soundManager.settings.muted) {
    playBackgroundMusic();
  }
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !popover.hidden) setOpen(false);
});
document.addEventListener("pointerdown", event => {
  if (!popover.hidden && !dock.contains(event.target)) setOpen(false);
});

// Chỉ phần tử được đánh dấu rõ ràng mới phát âm thanh, không bắt click toàn trang.
const INTERACTIVE_SELECTOR = [
  "button", "a[href]", "summary", "select",
  'input[type="button"]', 'input[type="submit"]', 'input[type="reset"]',
  'input[type="checkbox"]', 'input[type="radio"]',
  '[role="button"]', '[role="tab"]', '[role="switch"]',
  '[role="menuitem"]', '[role="option"]', "[onclick]"
].join(",");

function normalizeSoundHint(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function resolveClickSound(target) {
  const explicit = target.closest?.("[data-ui-sound]");
  if (explicit) {
    const requested = explicit.dataset.uiSound || "click-neutral";
    if (["none", "off", "silent"].includes(requested)) return null;
    if (requested === "toggle") return { deferred: "toggle", element: explicit };
    return { sound: requested, element: explicit };
  }

  const interactive = target.closest?.(INTERACTIVE_SELECTOR);
  if (!interactive || interactive.closest?.(".vhht-sound-dock")) return null;
  if (interactive.matches?.(':disabled,[aria-disabled="true"]')) return null;
  const hint = normalizeSoundHint([
    interactive.id,
    typeof interactive.className === "string" ? interactive.className : "",
    interactive.getAttribute?.("name"), interactive.getAttribute?.("type"),
    interactive.getAttribute?.("role"), interactive.getAttribute?.("aria-label"),
    interactive.getAttribute?.("title"), interactive.textContent
  ].filter(value => typeof value === "string").join(" "));

  if (interactive.matches?.('[role="switch"],input[type="checkbox"],input[type="radio"]')) return { deferred: "toggle", element: interactive };
  if (/(notification|thong bao|bell)/.test(hint)) return { sound: "notification" };
  if (/(logout|dang xuat)/.test(hint)) return { sound: "warning" };
  if (/(confirm|xac nhan|dong y)/.test(hint)) return { sound: "save-submit" };
  if (/(profile|ho so|avatar)/.test(hint)) return { sound: "click-secondary" };
  if (/(close|dong|thoat|xmark)/.test(hint)) return { sound: "close-panel" };
  if (/(back|quay lai|tro ve|bang tin)/.test(hint)) return { sound: "back" };
  if (/(cancel|huy)/.test(hint)) return { sound: "cancel" };
  if (/(delete|xoa|trash)/.test(hint)) return { sound: "delete" };
  if (/(search|tim kiem|tim ban)/.test(hint)) return { sound: "search" };
  if (interactive.hasAttribute?.("aria-expanded")) return { deferred: "expanded", element: interactive };
  if (/(copy|sao chep)/.test(hint)) return { sound: "copy" };
  if (/(share|chia se)/.test(hint)) return { sound: "share" };
  if (/(comment|binh luan|reply|tra loi)/.test(hint)) return { sound: "comment" };
  if (/(react|reaction|like|thich|cam xuc)/.test(hint)) return { sound: "like" };
  if (/(friend|ket ban|loi moi)/.test(hint)) return { sound: "friend-request" };
  if (/(send-message|gui tin|nhan tin|may bay)/.test(hint)) return { sound: "send-message" };
  if (/(save|luu|dang bai|dang nhap|dang ky|submit)/.test(hint)) return { sound: "save-submit" };
  if (/(upload|anh|video|tep|media)/.test(hint)) return { sound: "upload-start" };
  if (interactive.matches?.('[role="tab"]')) return { sound: "tab-switch" };
  if (interactive.matches?.('select,option,[role="option"]')) return { sound: "select-option" };
  if (interactive.matches?.('a[href]')) return { sound: "click-secondary" };
  if (interactive.matches?.('button[type="submit"],input[type="submit"],.primary,.btn-primary')) return { sound: "click-primary" };
  return { sound: "click-neutral" };
}

// Một listener ủy quyền bao phủ cả phần tử tĩnh lẫn nội dung được sinh động về sau.
if (!window.__vhhtGlobalClickSoundsBound) {
  window.__vhhtGlobalClickSoundsBound = true;
  document.addEventListener("click", event => {
  if (event.defaultPrevented || (typeof event.button === "number" && event.button > 0)) return;
  const target = event.target instanceof Element ? event.target : event.target?.parentElement;
  if (!target || dock.contains(target)) return;
  const result = resolveClickSound(target);
  if (!result) return;
  if (result.deferred) {
    queueMicrotask(() => {
      if (result.deferred === "toggle") {
        const enabled = result.element.matches?.(":checked")
          || result.element.getAttribute?.("aria-checked") === "true"
          || result.element.getAttribute?.("aria-pressed") === "true";
        playUiSound(enabled ? "toggle-on" : "toggle-off");
        return;
      }
      playUiSound(result.element.getAttribute?.("aria-expanded") === "true" ? "open-panel" : "close-panel");
    });
    return;
  }
  playUiSound(result.sound);
  }, false);
}
