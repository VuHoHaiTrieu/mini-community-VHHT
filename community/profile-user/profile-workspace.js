import { firebaseAuthentication, firebaseDatabase } from "../../shared/firebase-connection.js";
import { writePublicProfile } from "../../shared/secure-profile-service.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { removeFriendship } from "../../shared/friendship-service.js";
import { resolveDisplayName } from "../../shared/user-identity.js";
import { applyAvatarFallback, resolveAvatarUrl } from "../../shared/default-avatar.js";
import { soundManager } from "../../shared/audio/sound-manager.js?v=6";

const $ = id => document.getElementById(id);
const state = { viewer: null, profileId: "", profile: null, posts: [], friends: [] };
const settingsMobileQuery = window.matchMedia("(max-width: 1023px)");
let settingsReturnFocus = null;
let settingsScrollY = 0;
let settingsScrollLocked = false;
let settingsBodyStyle = { position: "", top: "", width: "", overflow: "" };
let activeSettingsPanel = "identity";

function setText(id, value) {
  const element = $(id);
  if (element) element.textContent = value;
}

function timestamp(value) {
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value?.seconds) return value.seconds * 1000;
  return Number(value || 0);
}

function postMedia(post) {
  if (Array.isArray(post.attachedImages) && post.attachedImages.length) return post.attachedImages;
  const url = post.attachedImage || post.mediaUrl;
  return url ? [{ url, type: post.mediaType || "image" }] : [];
}

function announce(message) {
  const toast = $("cosmic-toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(announce.timer);
  announce.timer = setTimeout(() => toast.classList.remove("visible"), 2600);
}

function activateTab(name, focus = false) {
  const tabs = [...document.querySelectorAll("[data-profile-tab]")];
  tabs.forEach(tab => {
    const active = tab.dataset.profileTab === name;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
    if (active && focus) tab.focus();
  });
  document.querySelectorAll(".profile-tab-panel").forEach(panel => {
    const active = panel.id === `profile-panel-${name}`;
    panel.hidden = !active;
    panel.classList.toggle("is-active", active);
  });
  history.replaceState(null, "", `${location.pathname}${location.search}#${name}`);
  const activeTab = document.querySelector(`[data-profile-tab="${name}"]`);
  const tabList = activeTab?.parentElement;
  if (activeTab instanceof HTMLElement && tabList instanceof HTMLElement) {
    const targetLeft = activeTab.offsetLeft - (tabList.clientWidth - activeTab.offsetWidth) / 2;
    tabList.scrollTo({ left: Math.max(0, targetLeft), behavior: "smooth" });
  }
}

function setupTabs() {
  const tabs = [...document.querySelectorAll("[data-profile-tab]")];
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => activateTab(tab.dataset.profileTab));
    tab.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      activateTab(tabs[next].dataset.profileTab, true);
    });
  });
  document.querySelectorAll("[data-profile-tab-target]").forEach(button => button.addEventListener("click", () => activateTab(button.dataset.profileTabTarget, true)));
  const initial = location.hash.slice(1);
  activateTab(["posts", "about", "friends", "media"].includes(initial) ? initial : "posts");
}

function openSettings(panel = "identity", openMobilePage = true) {
  // profileId is filled asynchronously. Do not make the settings button look
  // broken while the current user's profile is still being hydrated.
  if (!state.viewer || (state.profileId && state.profileId !== state.viewer.uid)) return;
  const dialog = $("profile-settings-center");
  if (!dialog) return;
  if (!settingsScrollLocked) {
    settingsReturnFocus = document.activeElement;
    settingsScrollY = window.scrollY;
    settingsBodyStyle = {
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
      overflow: document.body.style.overflow
    };
    settingsScrollLocked = true;
  }
  selectSettingsPanel(panel, settingsMobileQuery.matches && openMobilePage);
  if (!dialog.open) dialog.showModal();
  document.body.classList.add("profile-settings-open");
  document.body.style.top = `-${settingsScrollY}px`;
  document.body.style.position = "fixed";
  document.body.style.width = "100%";
  $("profile-settings-trigger")?.setAttribute("aria-expanded", "true");
  requestAnimationFrame(() => {
    const target = settingsMobileQuery.matches && !dialog.classList.contains("is-mobile-subpage")
      ? dialog.querySelector("[data-close-settings]")
      : dialog.querySelector(".profile-settings-panel.is-active button, .profile-settings-panel.is-active input, .profile-settings-panel.is-active select, .profile-settings-panel.is-active textarea");
    (target || dialog.querySelector("button, input, select, textarea"))?.focus({ preventScroll: true });
  });
}

function closeSettings() {
  const dialog = $("profile-settings-center");
  if (dialog?.open) dialog.close();
  document.body.classList.remove("profile-settings-open");
  if (settingsScrollLocked) {
    document.body.style.position = settingsBodyStyle.position;
    document.body.style.top = settingsBodyStyle.top;
    document.body.style.width = settingsBodyStyle.width;
    document.body.style.overflow = settingsBodyStyle.overflow;
    settingsScrollLocked = false;
    window.scrollTo({ top: settingsScrollY, behavior: "auto" });
  }
  $("profile-settings-trigger")?.setAttribute("aria-expanded", "false");
  (settingsReturnFocus instanceof HTMLElement ? settingsReturnFocus : $("profile-settings-trigger"))?.focus({ preventScroll: true });
  if (new URLSearchParams(location.search).get("embedSettings") === "1") parent.postMessage({ type: "vhht-close-settings" }, location.origin);
}

function clearMobileSettingsSelection() {
  if (!settingsMobileQuery.matches) return;
  document.querySelectorAll("[data-settings-panel]").forEach(button => {
    button.classList.remove("is-active");
    button.removeAttribute("aria-current");
  });
}

function selectSettingsPanel(name, openMobilePage = false) {
  activeSettingsPanel = name;
  document.querySelectorAll("[data-settings-panel]").forEach(button => {
    const active = button.dataset.settingsPanel === name;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  document.querySelectorAll("[data-settings-content]").forEach(panel => {
    const active = panel.dataset.settingsContent === name;
    panel.hidden = !active;
    panel.classList.toggle("is-active", active);
  });
  const dialog = $("profile-settings-center");
  if (settingsMobileQuery.matches) {
    dialog?.classList.toggle("is-mobile-subpage", openMobilePage);
    if (!openMobilePage) clearMobileSettingsSelection();
  }
  else dialog?.classList.remove("is-mobile-subpage");
  window.dispatchEvent(new CustomEvent("vhht-profile-settings-rendered", { detail: { panel: name } }));
}

function showSettingsIndex() {
  const dialog = $("profile-settings-center");
  dialog?.classList.remove("is-mobile-subpage");
  clearMobileSettingsSelection();
  requestAnimationFrame(() => dialog?.querySelector("[data-close-settings]")?.focus({ preventScroll: true }));
}

function trapSettingsFocus(event) {
  const dialog = $("profile-settings-center");
  if (event.key !== "Tab" || !dialog?.open) return;
  const focusable = [...dialog.querySelectorAll('button:not([disabled]):not([hidden]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')].filter(element => element.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0], last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

function setupSettings() {
  $("profile-settings-trigger")?.addEventListener("click", () => openSettings(activeSettingsPanel, false));
  $("edit-profile-hero-button")?.addEventListener("click", () => openSettings("identity"));
  document.querySelectorAll("[data-open-settings]").forEach(button => button.addEventListener("click", () => openSettings(button.dataset.openSettings)));
  document.querySelectorAll("[data-close-settings]").forEach(button => button.addEventListener("click", closeSettings));
  document.querySelectorAll("[data-settings-panel]").forEach(button => button.addEventListener("click", () => selectSettingsPanel(button.dataset.settingsPanel, true)));
  $("settings-mobile-back")?.addEventListener("click", showSettingsIndex);
  $("profile-settings-center")?.addEventListener("click", event => {
    if (event.target === $("profile-settings-center")) closeSettings();
  });
  $("profile-settings-center")?.addEventListener("cancel", event => {
    event.preventDefault();
    closeSettings();
  });
  $("profile-settings-center")?.addEventListener("keydown", trapSettingsFocus);
  settingsMobileQuery.addEventListener("change", event => {
    const dialog = $("profile-settings-center");
    if (!dialog?.open) return;
    if (event.matches) showSettingsIndex();
    else {
      dialog.classList.remove("is-mobile-subpage");
      selectSettingsPanel(activeSettingsPanel, false);
    }
  });
  document.querySelectorAll("[data-profile-photo-action]").forEach(button => button.addEventListener("click", () => {
    closeSettings();
    const input = button.dataset.profilePhotoAction === "avatar" ? $("avatar-file-selector") : $("cover-file-selector");
    setTimeout(() => input?.click(), 120);
  }));
}

function fact(icon, title, value) {
  const row = document.createElement("div");
  row.className = "profile-overview-fact";
  row.innerHTML = `<span><i class="fa-solid ${icon}" aria-hidden="true"></i></span><p><small></small><strong></strong></p>`;
  row.querySelector("small").textContent = title;
  row.querySelector("strong").textContent = value;
  return row;
}

function openBiographyEditor(card, currentBiography) {
  if (!card || state.profileId !== state.viewer?.uid || card.classList.contains("is-editing")) return;
  card.classList.add("is-editing");
  const form = document.createElement("form");
  form.className = "profile-biography-editor";
  form.innerHTML = `
    <label for="profile-inline-biography">Tiểu sử của bạn</label>
    <textarea id="profile-inline-biography" maxlength="240" rows="4" placeholder="Chia sẻ ngắn gọn về bạn..."></textarea>
    <div class="profile-biography-editor-footer">
      <span class="profile-biography-counter" aria-live="polite"></span>
      <div class="profile-biography-editor-actions">
        <button type="button" class="profile-biography-cancel">Hủy</button>
        <button type="submit" class="profile-biography-save"><i class="fa-solid fa-check" aria-hidden="true"></i> Lưu tiểu sử</button>
      </div>
    </div>`;
  const textarea = form.querySelector("textarea");
  const counter = form.querySelector(".profile-biography-counter");
  const updateCounter = () => { counter.textContent = `${textarea.value.length}/240`; };
  textarea.value = currentBiography;
  updateCounter();
  textarea.addEventListener("input", updateCounter);
  const closeEditor = () => {
    form.remove();
    card.classList.remove("is-editing");
    card.querySelector(".profile-about-inline-action")?.focus({ preventScroll: true });
  };
  form.querySelector(".profile-biography-cancel")?.addEventListener("click", closeEditor);
  textarea.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeEditor();
    }
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const biography = textarea.value.trim();
    const saveButton = form.querySelector(".profile-biography-save");
    saveButton.disabled = true;
    saveButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Đang lưu';
    try {
      await writePublicProfile(state.viewer.uid, {
        biography,
        updatedAt: serverTimestamp()
      });
      state.profile = { ...(state.profile || {}), biography };
      setText("profile-bio-heading", biography || "Chưa có tiểu sử");
      const settingsBiography = $("profile-biography-input");
      if (settingsBiography) settingsBiography.value = biography;
      window.dispatchEvent(new CustomEvent("vhht-profile-biography-updated", { detail: { biography } }));
      renderAbout();
      announce(biography ? "Đã cập nhật tiểu sử." : "Đã xóa tiểu sử.");
    } catch (error) {
      console.error("Không thể cập nhật tiểu sử", error);
      saveButton.disabled = false;
      saveButton.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i> Lưu tiểu sử';
      announce("Chưa thể lưu tiểu sử. Vui lòng thử lại.");
    }
  });
  card.append(form);
  requestAnimationFrame(() => textarea.focus({ preventScroll: true }));
}

function renderAbout() {
  const profile = state.profile || {};
  const overview = $("profile-overview-facts");
  const about = $("profile-about-grid");
  if (!overview || !about) return;
  overview.replaceChildren();
  about.replaceChildren();
  const entries = [
    ["fa-briefcase", "Công việc / Học vấn", profile.work],
    ["fa-location-dot", "Nơi sống", profile.location],
    ["fa-cake-candles", "Ngày sinh", profile.birthday ? new Date(`${profile.birthday}T00:00:00`).toLocaleDateString("vi-VN") : ""],
    ["fa-user", "Giới tính", profile.gender]
  ].filter(([, , value]) => String(value || "").trim());
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "profile-muted-empty";
    empty.textContent = state.profileId === state.viewer?.uid ? "Thêm thông tin để hồ sơ của bạn đầy đủ hơn." : "Thành viên chưa chia sẻ thông tin giới thiệu.";
    overview.append(empty);
  } else entries.slice(0, 3).forEach(entry => overview.append(fact(...entry)));

  const owner = state.profileId === state.viewer?.uid;
  const biographyText = String(profile.biography || "").trim();
  const biography = document.createElement("article");
  biography.className = `profile-about-card profile-about-biography${biographyText ? "" : " is-empty"}`;
  biography.innerHTML = '<span class="profile-card-icon"><i class="fa-solid fa-quote-left" aria-hidden="true"></i></span><div class="profile-about-card-copy"><small>ĐÔI NÉT VỀ TÔI</small><p></p></div>';
  biography.querySelector("p").textContent = biographyText || (owner ? "Thêm vài dòng ngắn để mọi người hiểu bạn hơn." : "Thành viên chưa chia sẻ tiểu sử.");
  if (owner) {
    const action = document.createElement("button");
    action.className = "profile-about-inline-action";
    action.type = "button";
    action.innerHTML = biographyText
      ? '<i class="fa-solid fa-pen" aria-hidden="true"></i> Sửa tiểu sử'
      : '<i class="fa-solid fa-plus" aria-hidden="true"></i> Thêm tiểu sử';
    action.addEventListener("click", () => openBiographyEditor(biography, biographyText));
    biography.querySelector(".profile-about-card-copy")?.append(action);
  }
  about.append(biography);

  const details = document.createElement("section");
  details.className = "profile-about-section profile-about-details";
  details.innerHTML = '<div class="profile-about-section-heading"><span><i class="fa-solid fa-address-card" aria-hidden="true"></i></span><div><small>THÔNG TIN CƠ BẢN</small><h3>Thông tin cá nhân</h3></div></div><div class="profile-about-detail-list"></div>';
  const detailList = details.querySelector(".profile-about-detail-list");
  if (entries.length) entries.forEach(([icon, label, value]) => {
    const item = document.createElement("div");
    item.className = "profile-about-detail-item";
    item.innerHTML = '<i aria-hidden="true"></i><div><small></small><strong></strong></div>';
    item.querySelector("i").className = `fa-solid ${icon}`;
    item.querySelector("small").textContent = label;
    item.querySelector("strong").textContent = value;
    detailList.append(item);
  });
  else {
    const empty = document.createElement("p");
    empty.className = "profile-about-section-empty";
    empty.textContent = owner ? "Bạn chưa bổ sung thông tin cá nhân." : "Thành viên chưa chia sẻ thông tin cá nhân.";
    detailList.append(empty);
  }
  about.append(details);

  const community = document.createElement("article");
  community.className = "profile-about-section profile-about-community";
  const joined = timestamp(profile.createdAt);
  const connectionLabel = profile.role === "admin" ? "người theo dõi" : "bạn bè";
  const connectionCount = profile.role === "admin" ? relationshipIds(profile.followers).length : relationshipIds(profile.friends).length;
  community.innerHTML = '<div class="profile-about-section-heading"><span><i class="fa-solid fa-chart-line" aria-hidden="true"></i></span><div><small>TỔNG QUAN</small><h3>Hoạt động hồ sơ</h3></div></div><div class="profile-about-community-stats"><span><strong></strong><em>Bài viết</em></span><span><strong></strong><em></em></span><span class="joined-stat"><strong></strong><em>Ngày tham gia</em></span></div>';
  const communityStats = community.querySelectorAll(".profile-about-community-stats span");
  communityStats[0].querySelector("strong").textContent = String(state.posts.length);
  communityStats[1].querySelector("strong").textContent = String(connectionCount);
  communityStats[1].querySelector("em").textContent = connectionLabel;
  communityStats[2].querySelector("strong").textContent = joined ? new Date(joined).toLocaleDateString("vi-VN") : "—";
  if (state.profileId === state.viewer?.uid || profile.accountVisibility === "public") {
    const contact = document.createElement("div");
    contact.className = "profile-about-contact-row";
    contact.innerHTML = '<i class="fa-solid fa-envelope" aria-hidden="true"></i><div><small>Email liên hệ</small><a class="profile-about-email"></a></div>';
    const emailLink = contact.querySelector("a");
    emailLink.textContent = profile.email || "Chưa có email hiển thị.";
    if (profile.email) emailLink.href = `mailto:${profile.email}`;
    community.append(contact);
  }
  about.append(community);
}

function relationshipId(value) {
  if (typeof value === "string") return value;
  return value?.uid || value?.userId || value?.id || "";
}

function relationshipIds(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(relationshipId).filter(Boolean))];
}

function canViewFriends() {
  if(state.profile?.role==="admin")return true;
  const visibility = state.profile?.friendsVisibility || "public";
  return state.profileId === state.viewer?.uid || visibility === "public" || (visibility === "friends" && relationshipIds(state.profile?.friends).includes(state.viewer?.uid));
}

async function fetchFriends() {
  const relationships = state.profile?.role==="admin"?(Array.isArray(state.profile?.followers)?state.profile.followers:[]):(Array.isArray(state.profile?.friends)?state.profile.friends:[]);
  const ids = relationshipIds(relationships).filter(id => id !== state.profileId);
  if (!canViewFriends()) return [];
  const snapshots = await Promise.all(ids.map(id => getDoc(doc(firebaseDatabase, "users", id)).catch(() => null)));
  const friends = snapshots.map((snapshot, index) => {
    const embedded = relationships.find(value => relationshipId(value) === ids[index]);
    const embeddedData = embedded && typeof embedded === "object" ? embedded : {};
    return snapshot?.exists() || Object.keys(embeddedData).length ? { ...embeddedData, ...(snapshot?.data() || {}), uid: ids[index] } : null;
  }).filter(Boolean);
  friends.forEach(friend => {
    friend.displayName = resolveDisplayName(friend);
  });
  return friends;
}

function friendCard(friend, compact = false) {
  const card = document.createElement("article");
  card.className = compact ? "profile-friend-preview" : "profile-friend-card";
  const name = resolveDisplayName(friend);
  const avatar = document.createElement("img");
  avatar.alt = `Ảnh đại diện của ${name}`;
  avatar.src = resolveAvatarUrl(friend.photoURL || friend.profileImage, { uid: friend.uid, displayName: name });
  applyAvatarFallback(avatar, { uid: friend.uid, displayName: name });
  const identity = document.createElement("a");
  const profileReturnTo = `${location.pathname}${location.search}${location.hash || "#friends"}`;
  identity.href = `user-profile.html?uid=${encodeURIComponent(friend.uid)}&returnTo=${encodeURIComponent(profileReturnTo)}`;
  identity.className = "profile-friend-identity";
  const label = document.createElement("span");
  label.innerHTML = "<strong></strong><small></small>";
  label.querySelector("strong").textContent = name;
  label.querySelector("strong").title = name;
  const details = [friend.work || friend.education, friend.location || friend.hometown, friend.role === "admin" ? "ADMIN" : state.profile?.role==="admin"?"Đang theo dõi":"Đã kết nối"].filter(Boolean);
  label.querySelector("small").textContent = details.join(" · ");
  identity.append(avatar, label);
  card.append(identity);
  if (!compact && state.viewer?.uid) {
    const actions = document.createElement("div");
    actions.className = "profile-friend-actions";
    const message = document.createElement("a");
    const returnTo = `${location.pathname}${location.search}#friends`;
    message.href = `../messages/messages-page.html?uid=${encodeURIComponent(friend.uid)}&returnTo=${encodeURIComponent(returnTo)}`;
    message.setAttribute("aria-label", `Nhắn tin cho ${name}`);
    message.title = `Nhắn tin cho ${name}`;
    message.innerHTML = '<i class="fa-regular fa-comment-dots" aria-hidden="true"></i><span>Nhắn tin</span>';
    actions.append(message);
    if (state.profileId === state.viewer.uid && state.profile?.role!=="admin") {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "danger";
      remove.setAttribute("aria-label", `Hủy kết bạn với ${name}`);
      remove.title = `Hủy kết bạn với ${name}`;
      remove.innerHTML = '<i class="fa-solid fa-user-minus" aria-hidden="true"></i><span>Hủy kết bạn</span>';
      remove.addEventListener("click", () => confirmRemoveFriend(friend, card));
      actions.append(remove);
    }
    card.append(actions);
  }
  return card;
}

async function confirmRemoveFriend(friend, card) {
  const name = resolveDisplayName(friend);
  const dialog = document.createElement("dialog");
  dialog.className = "profile-confirm-dialog";
  dialog.setAttribute("aria-labelledby", "profile-unfriend-title");
  dialog.setAttribute("aria-describedby", "profile-unfriend-description");
  dialog.innerHTML = '<form method="dialog"><span class="confirm-icon" aria-hidden="true"><i class="fa-solid fa-user-minus"></i></span><div class="confirm-copy"><h2 id="profile-unfriend-title">Hủy kết bạn?</h2><p id="profile-unfriend-description"></p></div><div class="confirm-actions"><button value="cancel">Giữ kết nối</button><button class="danger" value="confirm"><i class="fa-solid fa-user-minus" aria-hidden="true"></i> Hủy kết bạn</button></div></form>';
  dialog.querySelector("p").textContent = `Bạn và ${name} sẽ không còn trong danh sách bạn bè của nhau.`;
  document.body.append(dialog);
  dialog.addEventListener("close", async () => {
    if (dialog.returnValue === "confirm") {
      try {
        await removeFriendship(state.viewer.uid, friend.uid);
        state.friends = state.friends.filter(item => item.uid !== friend.uid);
        state.profile.friends = relationshipIds(state.profile.friends).filter(id => id !== friend.uid);
        card.remove();
        renderFriendCollections();
        announce("Đã hủy kết bạn ở cả hai tài khoản.");
      } catch (error) {
        console.error(error);
        announce("Không thể hủy kết bạn. Vui lòng thử lại.");
      }
    }
    dialog.remove();
  });
  dialog.showModal();
}

function renderFriendCollections() {
  const preview = $("profile-friends-preview");
  const list = $("profile-friends-tab-list");
  const count = state.friends.length;
  const adminProfile=state.profile?.role==="admin";
  const isOwner = state.profileId === state.viewer?.uid;
  const canView = canViewFriends();
  const search = document.querySelector("#profile-panel-friends .profile-friends-search");
  const tabCount = $("profile-friends-tab-count");
  setText("profile-friends-preview-count", `${count} người`);
  if (tabCount) {
    tabCount.hidden = !canView;
    tabCount.textContent = `${count} ${adminProfile ? "người theo dõi" : "bạn bè"}`;
  }
  if (search) {
    search.hidden = !canView || !count;
    const input = search.querySelector("input");
    if (input) input.value = "";
  }
  if (preview) {
    preview.replaceChildren();
    state.friends.slice(0, 6).forEach(friend => preview.append(friendCard(friend, true)));
    if (!count) preview.innerHTML = `<p class="profile-muted-empty">${adminProfile?"Chưa có người theo dõi.":"Chưa có kết nối hiển thị."}</p>`;
  }
  if (list) {
    list.replaceChildren();
    if (!canView) {
      list.innerHTML = '<div class="profile-connection-empty is-private"><div class="profile-connection-empty-visual" aria-hidden="true"><span><i class="fa-solid fa-lock"></i></span></div><div class="profile-connection-empty-copy"><span class="section-eyebrow">QUYỀN RIÊNG TƯ</span><h3>Danh sách kết nối đang được ẩn</h3><p>Chủ hồ sơ chỉ chia sẻ danh sách này với những người được phép xem.</p></div></div>';
    } else if (!count) {
      const heading = adminProfile ? "Chưa có người theo dõi" : "Chưa có bạn bè";
      const description = adminProfile ? "Những thành viên theo dõi tài khoản này sẽ được sắp xếp rõ ràng tại đây." : (isOwner ? "Hãy khám phá cộng đồng và bắt đầu những kết nối có ý nghĩa." : "Khi thành viên có kết nối mới, danh sách sẽ xuất hiện tại đây.");
      const action = isOwner && !adminProfile ? '<a class="profile-connection-empty-action" href="../community-feed-page.html"><i class="fa-solid fa-user-plus" aria-hidden="true"></i> Khám phá thành viên</a>' : "";
      list.innerHTML = `<div class="profile-connection-empty"><div class="profile-connection-empty-visual" aria-hidden="true"><span><i class="fa-solid ${adminProfile ? "fa-users-viewfinder" : "fa-user-group"}"></i></span><span><i class="fa-regular fa-comment-dots"></i></span></div><div class="profile-connection-empty-copy"><span class="section-eyebrow">${adminProfile ? "CỘNG ĐỒNG THEO DÕI" : "KẾT NỐI"}</span><h3>${heading}</h3><p>${description}</p>${action}</div></div>`;
    }
    else {
      state.friends.forEach(friend => list.append(friendCard(friend)));
      const noResults = document.createElement("div");
      noResults.id = "profile-friends-no-results";
      noResults.className = "profile-friends-no-results";
      noResults.hidden = true;
      noResults.innerHTML = '<span><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i></span><div><h3>Không tìm thấy kết nối</h3><p>Thử tìm bằng tên hoặc thông tin khác.</p></div>';
      list.append(noResults);
    }
  }
}

async function renderFriends() {
  try {
    state.friends = await fetchFriends();
    renderFriendCollections();
  } catch (error) {
    console.error("Không thể tải bạn bè hồ sơ", error);
    $("profile-friends-tab-list")?.replaceChildren();
  }
}

function renderMedia() {
  const gallery = $("profile-media-tab-list");
  if (!gallery) return;
  gallery.replaceChildren();
  const media = state.posts.flatMap(post => postMedia(post).map(item => ({ ...item, postId: post.id, caption: post.content || "" })));
  if (!media.length) {
    const isOwnProfile = state.viewer?.uid === state.profileId;
    gallery.innerHTML = `<div class="profile-media-empty">
      <div class="profile-media-empty-visual" aria-hidden="true"><div class="profile-media-empty-stack"><span><i class="fa-regular fa-image"></i></span><span><i class="fa-solid fa-play"></i></span></div></div>
      <div class="profile-media-empty-copy"><span class="section-eyebrow">THƯ VIỆN HÌNH ẢNH</span><h3>Chưa có ảnh hoặc video</h3><p>${isOwnProfile ? "Ảnh và video trong các bài viết của bạn sẽ được tự động sắp xếp tại đây." : "Thành viên này chưa chia sẻ ảnh hoặc video trong các bài viết bạn có thể xem."}</p>${isOwnProfile ? '<button class="profile-media-empty-action" type="button" data-media-empty-compose><i class="fa-solid fa-plus" aria-hidden="true"></i> Tạo bài viết có ảnh</button>' : ""}</div>
    </div>`;
    gallery.querySelector("[data-media-empty-compose]")?.addEventListener("click", () => {
      activateTab("posts");
      window.setTimeout(() => $("profile-post-content")?.focus(), 0);
    });
    return;
  }
  media.forEach(item => {
    const link = document.createElement("a");
    link.className = "profile-gallery-item";
    link.dataset.mediaType = item.type === "video" ? "video" : "image";
    link.href = `#posts`;
    link.dataset.targetPost = item.postId;
    link.setAttribute("aria-label", item.caption ? `Xem bài viết: ${item.caption.slice(0, 80)}` : "Xem bài viết chứa media");
    link.innerHTML = item.type === "video" ? `<video src="${item.url}" muted playsinline preload="metadata"></video><i class="fa-solid fa-play" aria-hidden="true"></i>` : `<img src="${item.url}" alt="" loading="lazy" decoding="async">`;
    link.addEventListener("click", event => {
      event.preventDefault();
      activateTab("posts");
      const safePostId = window.CSS?.escape ? CSS.escape(item.postId) : String(item.postId).replace(/["\\]/g, "\\$&");
      const postCard = document.querySelector(`.social-post[data-id="${safePostId}"]`);
      const mediaTrigger = postCard?.querySelector("[data-view-media], .profile-post-media img, .profile-post-media video");
      if (mediaTrigger instanceof HTMLElement) mediaTrigger.click();
      else postCard?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    gallery.append(link);
  });
}

function setupCollectionFilters() {
  $("profile-friends-search")?.addEventListener("input", event => {
    const query = event.target.value.trim().toLocaleLowerCase("vi-VN");
    let visibleCount = 0;
    document.querySelectorAll("#profile-friends-tab-list .profile-friend-card").forEach(card => {
      const hidden = Boolean(query && !card.textContent.toLocaleLowerCase("vi-VN").includes(query));
      card.hidden = hidden;
      if (!hidden) visibleCount += 1;
    });
    const noResults = $("profile-friends-no-results");
    if (noResults) noResults.hidden = !query || visibleCount > 0;
  });
  document.querySelectorAll("[data-media-filter]").forEach(button => button.addEventListener("click", () => {
    document.querySelectorAll("[data-media-filter]").forEach(item => item.classList.toggle("is-active", item === button));
    document.querySelectorAll("#profile-media-tab-list .profile-gallery-item").forEach(item => {
      item.hidden = button.dataset.mediaFilter !== "all" && item.dataset.mediaType !== button.dataset.mediaFilter;
    });
  }));
}

function renderProfile(profile) {
  state.profile = profile;
  const name = resolveDisplayName(profile, state.profileId === state.viewer?.uid ? state.viewer : null);
  setText("profile-topbar-name", name);
  document.title = `${name} - VHHT`;
  const roleBadge = $("profile-role-badge");
  if (roleBadge) roleBadge.hidden = profile.role !== "admin";
  setText("profile-account-role", profile.role === "admin" ? "ADMIN" : "Thành viên");
  setText("profile-account-status", profile.accountStatus === "disabled" ? "Đã vô hiệu hóa" : "Đang hoạt động");
  const settingsButton = $("profile-settings-trigger");
  const isOwner = state.profileId === state.viewer?.uid;
  document.body.classList.toggle("own-profile", isOwner);
  document.body.classList.toggle("viewing-profile", !isOwner);
  if (settingsButton) {
    settingsButton.hidden = !isOwner;
    settingsButton.style.display = isOwner ? "" : "none";
  }
  document.querySelectorAll(".owner-only-control,.owner-photo-controls,#avatar-upload-label,#remove-avatar-button").forEach(control => {
    control.hidden = !isOwner;
    control.classList.toggle("is-owner-hidden", !isOwner);
    control.setAttribute("aria-hidden", String(!isOwner));
  });
  $("profile-settings-center")?.classList.toggle("owner-settings", isOwner);
  renderAbout();
  renderFriends();
}

function renderPostsSummary(posts) {
  state.posts = posts;
  setText("profile-post-count-label", `${posts.length} bài viết`);
  setText("profile-hero-post-count", String(posts.length));
  renderAbout();
  renderMedia();
}

function setupPostFilters() {
  document.querySelectorAll("[data-post-filter]").forEach(button => button.addEventListener("click", () => {
    document.querySelectorAll("[data-post-filter]").forEach(item => item.classList.toggle("is-active", item === button));
    const filter = button.dataset.postFilter;
    document.querySelectorAll("#profile-posts-list .social-post").forEach(card => {
      const post = state.posts.find(item => item.id === card.dataset.id);
      const media = postMedia(post || {}), hasImage = media.some(item => item.type !== "video"), hasVideo = media.some(item => item.type === "video");
      card.hidden = filter === "image" ? !hasImage : filter === "video" ? !hasVideo : filter === "text" ? Boolean(media.length) : false;
    });
  }));
}

function settingSwitch(label, description, checked, onChange, icon = "fa-sliders") {
  const row = document.createElement("div");
  row.className = "profile-setting-row profile-switch-row";
  row.innerHTML = '<span><i class="fa-solid" aria-hidden="true"></i><strong></strong><small></small></span><button class="profile-switch-control" type="button" role="switch"></button>';
  row.querySelector("span > i").classList.add(icon);
  row.querySelector("strong").textContent = label;
  row.querySelector("small").textContent = description;
  const control = row.querySelector("button");
  const setChecked = value => {
    control.setAttribute("aria-checked", String(value));
    control.setAttribute("aria-label", `${label}: ${value ? "bật" : "tắt"}`);
  };
  setChecked(checked);
  control.addEventListener("click", () => {
    const next = control.getAttribute("aria-checked") !== "true";
    setChecked(next);
    onChange(next);
  });
  row.addEventListener("click", event => {
    if (event.target.closest("button")) return;
    control.click();
  });
  return row;
}

function renderSoundSettings() {
  const host = $("profile-sound-settings");
  if (!host) return;
  const settings = soundManager.settings;
  let updateAvailability = () => {};
  const muted = settingSwitch("Bật toàn bộ âm thanh", "Gạt tắt khi bạn muốn im lặng hoàn toàn trên thiết bị này.", !settings.muted, value => {
    soundManager.setMuted(!value);
    updateAvailability(value);
  }, "fa-volume-high");
  const effects = settingSwitch("Hiệu ứng thao tác", "Âm bấm, hoàn tất, cảnh báo và thông báo.", settings.effectsEnabled, value => soundManager.setEffectsEnabled(value), "fa-wand-magic-sparkles");
  const music = settingSwitch("Không gian nền", "Âm nền nhẹ trên những trang có hỗ trợ.", settings.musicEnabled, value => soundManager.setMusicEnabled(value), "fa-wave-square");
  const groupDefinitions = [
    ["buttons", "Nút bấm", "Các nút và thao tác cơ bản.", "fa-computer-mouse"],
    ["navigation", "Điều hướng", "Mở, đóng, quay lại và chuyển thẻ.", "fa-compass"],
    ["controls", "Lựa chọn", "Công tắc, danh sách và tùy chọn.", "fa-sliders"],
    ["actions", "Hành động", "Lưu, tìm kiếm, sao chép và tải tệp.", "fa-bolt"],
    ["social", "Tương tác xã hội", "Tin nhắn, cảm xúc, bình luận và chia sẻ.", "fa-user-group"],
    ["feedback", "Phản hồi hệ thống", "Thành công, cảnh báo, lỗi và thông báo.", "fa-circle-info"]
  ];
  const groupRows = groupDefinitions.map(([key, label, description, icon]) => settingSwitch(
    label,
    description,
    settings.soundGroups?.[key] !== false,
    value => soundManager.setSoundGroup(key, value),
    icon
  ));
  const soundEffectDefinitions = [
    ["click-neutral", "Nút thường", "Thao tác phụ và nút trung tính.", "fa-computer-mouse"],
    ["click-primary", "Nút chính", "Đăng, tiếp tục và hành động nổi bật.", "fa-arrow-pointer"],
    ["click-secondary", "Liên kết và hồ sơ", "Mở liên kết, avatar và hồ sơ.", "fa-address-card"],
    ["tab-switch", "Chuyển thẻ", "Chuyển khu vực nội dung.", "fa-table-columns"],
    ["select-option", "Chọn tùy chọn", "Chọn mục trong danh sách.", "fa-list-check"],
    ["toggle-on", "Bật công tắc", "Bật một thiết lập.", "fa-toggle-on"],
    ["toggle-off", "Tắt công tắc", "Tắt một thiết lập.", "fa-toggle-off"],
    ["open-panel", "Mở bảng", "Mở menu, hộp thoại và bảng điều khiển.", "fa-up-right-and-down-left-from-center"],
    ["close-panel", "Đóng bảng", "Đóng bảng và hộp thoại.", "fa-xmark"],
    ["back", "Quay lại", "Các nút điều hướng trở về.", "fa-arrow-left"],
    ["save-submit", "Lưu và xác nhận", "Lưu dữ liệu hoặc xác nhận thao tác.", "fa-check"],
    ["upload-start", "Bắt đầu tải lên", "Khi chọn tệp để tải lên.", "fa-cloud-arrow-up"],
    ["upload-complete", "Tải lên hoàn tất", "Khi tải tệp thành công.", "fa-cloud-arrow-up"],
    ["search", "Tìm kiếm", "Mở hoặc thực hiện tìm kiếm.", "fa-magnifying-glass"],
    ["copy", "Sao chép", "Sao chép nội dung hoặc mã.", "fa-copy"],
    ["send-message", "Gửi tin nhắn", "Khi gửi tin nhắn.", "fa-paper-plane"],
    ["receive-message", "Nhận tin nhắn", "Khi có tin nhắn mới.", "fa-inbox"],
    ["like", "Thả cảm xúc", "Thích hoặc chọn cảm xúc.", "fa-heart"],
    ["comment", "Bình luận", "Gửi hoặc mở bình luận.", "fa-comment"],
    ["share", "Chia sẻ", "Chia sẻ bài viết.", "fa-share"],
    ["friend-request", "Kết bạn", "Gửi hoặc xử lý lời mời.", "fa-user-plus"],
    ["success", "Thành công", "Thao tác đã hoàn tất.", "fa-circle-check"],
    ["error", "Lỗi", "Thao tác thất bại.", "fa-circle-xmark"],
    ["warning", "Cảnh báo và đăng xuất", "Cảnh báo hoặc yêu cầu xác nhận.", "fa-triangle-exclamation"],
    ["delete", "Xóa", "Xóa nội dung.", "fa-trash"],
    ["notification", "Thông báo", "Mở thông báo hoặc nhận thông báo mới.", "fa-bell"],
    ["cancel", "Hủy", "Hủy thao tác.", "fa-ban"]
  ];
  const soundDetail = document.createElement("section");
  soundDetail.className = "profile-sound-detail-section";
  soundDetail.innerHTML = '<header><h3>Âm thanh từng thao tác</h3><p>Bật hoặc tắt riêng từng phản hồi. Mặc định tất cả đều bật.</p></header><div class="settings-sound-effect-grid"></div>';
  const effectRows = soundEffectDefinitions.map(([key, label, description, icon]) => settingSwitch(
    label,
    description,
    settings.soundEffects?.[key] !== false,
    value => {
      soundManager.setSoundEffect(key, value);
      if (value) soundManager.play(key);
    },
    icon
  ));
  soundDetail.querySelector(".settings-sound-effect-grid").append(...effectRows);
  const volumeControl = (label, value, setter) => {
    const row = document.createElement("label");
    row.className = "profile-volume-setting";
    row.innerHTML = '<span><strong></strong><output></output></span><input type="range" min="0" max="1" step="0.05">';
    row.querySelector("strong").textContent = label;
    const input = row.querySelector("input"), output = row.querySelector("output");
    input.value = value;
    output.textContent = `${Math.round(value * 100)}%`;
    const syncRangeProgress = () => input.style.setProperty("--volume-progress", `${Math.round(Number(input.value) * 100)}%`);
    syncRangeProgress();
    let timer;
    input.addEventListener("input", () => {
      output.textContent = `${Math.round(Number(input.value) * 100)}%`;
      syncRangeProgress();
      clearTimeout(timer);
      timer = setTimeout(() => setter(Number(input.value)), 80);
    });
    return row;
  };
  const volumeRows = [
    volumeControl("Âm lượng chung", settings.masterVolume, value => soundManager.setMasterVolume(value)),
    volumeControl("Hiệu ứng", settings.effectsVolume, value => soundManager.setEffectsVolume(value)),
    volumeControl("Nhạc nền", settings.musicVolume, value => soundManager.setMusicVolume(value))
  ];
  const tests = document.createElement("div");
  tests.className = "profile-sound-tests";
  tests.innerHTML = '<button type="button"><i class="fa-solid fa-hand-pointer" aria-hidden="true"></i> Thử hiệu ứng</button><button type="button"><i class="fa-regular fa-bell" aria-hidden="true"></i> Thử thông báo</button>';
  tests.children[0].addEventListener("click", async () => { await soundManager.unlock(); soundManager.play("click-primary"); });
  tests.children[1].addEventListener("click", async () => { await soundManager.unlock(); soundManager.play("notification"); });
  const soundOverview=document.createElement("section");
  soundOverview.className="profile-sound-section profile-sound-overview";
  soundOverview.innerHTML='<header><h3>Điều khiển âm thanh</h3><p>Thiết lập nhanh âm thanh tổng thể và từng nhóm hoạt động.</p></header><div class="profile-sound-section-grid"></div>';
  soundOverview.querySelector(".profile-sound-section-grid").append(muted,effects,music,...groupRows);
  soundDetail.classList.add("profile-sound-section");
  const volumeSection=document.createElement("section");
  volumeSection.className="profile-sound-section profile-sound-volume-section";
  volumeSection.innerHTML='<header><h3>Âm lượng và kiểm tra</h3><p>Cân bằng mức âm thanh trên thiết bị hiện tại.</p></header><div class="profile-sound-volume-grid"></div>';
  volumeSection.querySelector(".profile-sound-volume-grid").append(...volumeRows);
  volumeSection.append(tests);
  host.replaceChildren(soundOverview,soundDetail,volumeSection);
  updateAvailability = enabled => {
    [effects, music, ...groupRows, soundDetail, ...volumeRows, tests].forEach(element => element.classList.toggle("is-disabled", !enabled));
    [effects, music, ...groupRows, soundDetail, ...volumeRows, tests].forEach(element => {
      element.querySelectorAll("button, input").forEach(control => {
        control.disabled = !enabled;
        control.setAttribute("aria-disabled", String(!enabled));
      });
    });
  };
  updateAvailability(!settings.muted);
}

function setupAppearance() {
  const text = $("profile-text-size"), motion = $("profile-motion-setting"), density = $("profile-density-setting");
  const apply = () => {
    document.body.classList.toggle("profile-large-text", text?.value === "large");
    document.body.classList.toggle("profile-small-text", text?.value === "small");
    document.body.classList.toggle("profile-reduced-motion", motion?.value === "reduced");
    document.body.classList.toggle("profile-compact-density", density?.value === "compact");
  };
  if (text) text.value = localStorage.getItem("vhht-profile-text-size") || "normal";
  if (motion) motion.value = localStorage.getItem("vhht-profile-motion") || "full";
  if (density) density.value = localStorage.getItem("vhht-profile-density") || "comfortable";
  text?.addEventListener("change", () => { localStorage.setItem("vhht-profile-text-size", text.value); apply(); });
  motion?.addEventListener("change", () => { localStorage.setItem("vhht-profile-motion", motion.value); apply(); });
  density?.addEventListener("change", () => { localStorage.setItem("vhht-profile-density", density.value); apply(); });
  apply();
}

function setupComposerState() {
  const composer = $("profile-composer");
  const textarea = $("profile-post-content");
  const preview = $("profile-media-preview");
  const mediaInput = $("profile-post-media");
  if (!composer || !textarea) return;
  const hasDraft = () => Boolean(textarea.value.trim() || preview?.children.length);
  const expand = () => composer.classList.add("is-expanded");
  const collapseIfEmpty = () => {
    if (!hasDraft() && !textarea.matches(":focus")) composer.classList.remove("is-expanded");
  };
  textarea.addEventListener("focus", expand);
  textarea.addEventListener("input", () => hasDraft() ? expand() : collapseIfEmpty());
  mediaInput?.addEventListener("change", expand);
  $("profile-cancel-compose")?.addEventListener("click", () => setTimeout(collapseIfEmpty));
  $("profile-publish-button")?.addEventListener("click", () => setTimeout(collapseIfEmpty, 500));
  new MutationObserver(() => hasDraft() ? expand() : collapseIfEmpty()).observe(preview, { childList: true });
  collapseIfEmpty();
}

function observeAvatarFallbacks() {
  const repair = root => root.querySelectorAll?.("img").forEach(image => {
    if (image.closest(".profile-shell") && !String(image.getAttribute("src") || "").trim()) applyAvatarFallback(image, { uid: image.dataset.uid || state.profileId, displayName: image.alt || state.profile?.displayName || "VHHT" });
  });
  repair(document);
  new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => node.nodeType === 1 && repair(node)))).observe(document.body, { childList: true, subtree: true });
}

window.addEventListener("vhht-profile-data", event => {
  state.profileId = event.detail.profileId;
  renderProfile(event.detail.profile || {});
});
window.addEventListener("vhht-profile-posts", event => {
  if (!state.profileId || event.detail.profileId === state.profileId) renderPostsSummary(event.detail.posts || []);
});

onAuthStateChanged(firebaseAuthentication, async user => {
  if (!user) return;
  state.viewer = user;
  const pageParams = new URLSearchParams(location.search);
  state.profileId = pageParams.get("uid") || user.uid;
  try {
    const snapshot = await getDoc(doc(firebaseDatabase, "users", state.profileId));
    if (snapshot.exists()) renderProfile({ uid: state.profileId, ...snapshot.data() });
    const requestedSettingsPanel = pageParams.get("settings");
    if (state.profileId === user.uid && requestedSettingsPanel) {
      requestAnimationFrame(() => {
        if (requestedSettingsPanel === "index") openSettings("identity", false);
        else openSettings(requestedSettingsPanel);
      });
    }
  } catch (error) {
    console.warn("Không thể tải lớp trình bày hồ sơ", error);
  }
});

setupTabs();
setupSettings();
setupPostFilters();
setupCollectionFilters();
renderSoundSettings();
setupAppearance();
setupComposerState();
observeAvatarFallbacks();
