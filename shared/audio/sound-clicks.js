import { playUiSound } from "./sound-manager.js";

const INTERACTIVE_SELECTOR = [
  "button", "a[href]", "summary", "select",
  'input[type="button"]', 'input[type="submit"]', 'input[type="reset"]',
  'input[type="checkbox"]', 'input[type="radio"]',
  '[role="button"]', '[role="tab"]', '[role="switch"]',
    '[role="menuitem"]', '[role="option"]', "[data-action]", "[data-ui-sound]", "[onclick]",
    "label[for]", "[tabindex='0']", "[aria-controls]", "[aria-haspopup]"
].join(",");

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function soundFor(target) {
  const explicit = target.closest?.("[data-ui-sound]");
  if (explicit) {
    const requested = explicit.dataset.uiSound || "click-neutral";
    if (["none", "off", "silent"].includes(requested)) return null;
    if (requested === "toggle") return { deferred: "toggle", element: explicit };
    return { sound: requested, element: explicit };
  }

  const element = target.closest?.(INTERACTIVE_SELECTOR);
  if (!element || element.closest(".vhht-sound-dock")) return null;

  if (element.matches('[role="switch"],input[type="checkbox"],input[type="radio"]')) {
    return { deferred: "toggle", element };
  }
  const hint = normalize([
    element.id,
    element.className,
    element.getAttribute("aria-label"),
    element.getAttribute("title"),
    element.dataset.action,
    element.textContent
  ].join(" "));

  if (/(notification|thong bao|bell)/.test(hint)) return { sound: "notification" };
  if (/(logout|dang xuat)/.test(hint)) return { sound: "warning" };
  if (/(confirm|xac nhan|dong y)/.test(hint)) return { sound: "save-submit" };
  if (/(profile|ho so|avatar)/.test(hint)) return { sound: "click-secondary" };
  if (/(close|dong|thoat|xmark)/.test(hint)) return { sound: "close-panel" };
  if (/(back|quay lai|bang tin)/.test(hint)) return { sound: "back" };
  if (/(cancel|huy)/.test(hint)) return { sound: "cancel" };
  if (/(delete|remove|xoa|thu hoi)/.test(hint)) return { sound: "delete" };
  if (/(search|tim kiem|tim ban)/.test(hint)) return { sound: "search" };
  if (element.hasAttribute("aria-expanded")) return { deferred: "expanded", element };
  if (/(copy|sao chep)/.test(hint)) return { sound: "copy" };
  if (/(share|chia se)/.test(hint)) return { sound: "share" };
  if (/(comment|binh luan|reply|tra loi)/.test(hint)) return { sound: "comment" };
  if (/(react|reaction|like|thich|cam xuc)/.test(hint)) return { sound: "like" };
  if (/(friend|ket ban|loi moi)/.test(hint)) return { sound: "friend-request" };
  if (/(send-message|gui tin|nhan tin|may bay)/.test(hint)) return { sound: "send-message" };
  if (/(save|luu|dang bai|dang nhap|dang ky|submit)/.test(hint)) return { sound: "save-submit" };
  if (/(upload|anh|video|tep|media)/.test(hint)) return { sound: "upload-start" };
  if (element.matches('[role="tab"]')) return { sound: "tab-switch" };
  if (element.matches('select,option,[role="option"]')) return { sound: "select-option" };
  if (element.matches('a[href]')) return { sound: "click-secondary" };
  if (element.matches('button[type="submit"],input[type="submit"],.primary,.btn-primary')) return { sound: "click-primary" };
  return { sound: "click-neutral" };
}

if (!window.__vhhtGlobalClickSoundsBound) {
  window.__vhhtGlobalClickSoundsBound = true;
  document.addEventListener("click", event => {
    if (typeof event.button === "number" && event.button > 0) return;
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    if (!target) return;
    const result = soundFor(target);
    if (!result) return;

    if (!result.deferred) {
      playUiSound(result.sound);
      return;
    }

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
  }, true);
}
