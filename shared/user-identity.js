const GENERIC_NAMES = new Set(["user", "member", "thành viên", "thành viên vhht", "người dùng", "phi hành gia"]);

export function isGeneratedDisplayName(value, email = "") {
    const name = String(value || "").trim();
    if (!name) return true;
    const normalized = name.toLocaleLowerCase("vi-VN");
    const emailPrefix = String(email || "").split("@")[0].trim().toLocaleLowerCase("vi-VN");
    return GENERIC_NAMES.has(normalized) || (emailPrefix && normalized === emailPrefix);
}

export function resolveDisplayName(userData = {}, authenticatedUser = null) {
    const email = userData.email || authenticatedUser?.email || "";
    const candidates = [
        userData.displayName,
        userData.fullName,
        userData.name,
        userData.username,
        userData.userName,
        authenticatedUser?.displayName
    ];
    const meaningful = candidates.map(value => String(value || "").trim()).find(value => value && !isGeneratedDisplayName(value, email));
    return meaningful || "Thành viên VHHT";
}

export function identityFields(displayName, photoURL = "") {
    return { displayName: String(displayName || "").trim(), photoURL: photoURL || "" };
}
