export function getAvatarInitials(displayName = "") {
  const words = String(displayName).trim().split(/\s+/u).filter(Boolean);
  if (!words.length) return "VH";
  const letters = words.length === 1 ? words[0].slice(0, 2) : `${words[0][0]}${words.at(-1)[0]}`;
  return letters.toLocaleUpperCase("vi-VN");
}

export function getDefaultAvatarUrl({ uid = "", displayName = "" } = {}) {
  const initials = getAvatarInitials(displayName);
  let seed = 0;
  for (const character of String(uid || displayName || "VHHT")) seed = (seed * 31 + character.charCodeAt(0)) >>> 0;
  const hue = 188 + (seed % 72);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="hsl(${hue} 88% 62%)"/><stop offset="1" stop-color="hsl(${(hue + 48) % 360} 78% 42%)"/></linearGradient><radialGradient id="s" cx="28%" cy="20%"><stop stop-color="#fff" stop-opacity=".52"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><circle cx="60" cy="60" r="58" fill="#071426" stroke="#78ddff" stroke-width="4"/><circle cx="60" cy="60" r="52" fill="url(#g)"/><circle cx="60" cy="60" r="52" fill="url(#s)"/><text x="60" y="69" text-anchor="middle" fill="white" font-family="Arial,sans-serif" font-size="34" font-weight="800">${initials}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function resolveAvatarUrl(source, identity = {}) {
  return String(source || "").trim() || getDefaultAvatarUrl(identity);
}

export function applyAvatarFallback(image, identity = {}) {
  if (!image) return;
  const fallback = getDefaultAvatarUrl(identity);
  if (!String(image.getAttribute("src") || "").trim()) image.src = fallback;
  image.onerror = () => {
    image.onerror = null;
    image.src = fallback;
  };
}

export function createDefaultAvatar(identity = {}, className = "") {
  const image = document.createElement("img");
  image.className = className;
  image.alt = identity.displayName ? `Ảnh đại diện của ${identity.displayName}` : "Ảnh đại diện mặc định";
  image.src = getDefaultAvatarUrl(identity);
  return image;
}
