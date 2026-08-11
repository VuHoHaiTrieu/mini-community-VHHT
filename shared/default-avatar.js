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
  const starX = 22 + (seed % 76);
  const starY = 18 + ((seed >>> 5) % 38);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g" x1="8" y1="4" x2="112" y2="116" gradientUnits="userSpaceOnUse"><stop stop-color="#eef3ff"/><stop offset=".46" stop-color="#9ba9c5"/><stop offset="1" stop-color="#35415b"/></linearGradient><radialGradient id="n" cx="78%" cy="16%" r="80%"><stop stop-color="#fff" stop-opacity=".72"/><stop offset=".45" stop-color="#b8c7e4" stop-opacity=".18"/><stop offset="1" stop-color="#717c96" stop-opacity="0"/></radialGradient><linearGradient id="t" x1="38" y1="39" x2="82" y2="79" gradientUnits="userSpaceOnUse"><stop stop-color="#fff"/><stop offset=".55" stop-color="#f4f7ff"/><stop offset="1" stop-color="#cbd4e7"/></linearGradient><filter id="glow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2.2" result="b"/><feColorMatrix in="b" values=".8 0 0 0 .2 0 .85 0 0 .23 0 0 1 0 .34 0 0 0 .32 0"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><rect width="120" height="120" fill="url(#g)"/><rect width="120" height="120" fill="url(#n)"/><path d="M-8 103c23-20 41 1 63-13s39-10 73 2v36H-8Z" fill="#283247" opacity=".34"/><circle cx="${starX}" cy="${starY}" r="1.2" fill="#fff" opacity=".76"/><circle cx="91" cy="86" r="1" fill="#fff" opacity=".5"/><path d="m94 18 1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5Z" fill="#fff" opacity=".88"/><text x="60" y="72" text-anchor="middle" fill="url(#t)" font-family="Arial,sans-serif" font-size="35" font-weight="800" letter-spacing="-1" filter="url(#glow)">${initials}</text></svg>`;
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
