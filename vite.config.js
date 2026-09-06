import { defineConfig } from "vite";
import { resolve } from "node:path";
import { copyFile, mkdir } from "node:fs/promises";

const root = process.cwd();
const page = path => resolve(root, path);

export default defineConfig({
  base: "./",
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    manifest: true,
    rollupOptions: {
      external: id => /^https:\/\//.test(id),
      input: {
        index: page("index.html"),
        pwaStart: page("pwa-start.html"),
        offline: page("offline.html"),
        login: page("authentication/login-page.html"),
        register: page("authentication/register-page.html"),
        forgotPassword: page("authentication/forgot-password-page.html"),
        resetPassword: page("authentication/reset-password-page.html"),
        usernameSetup: page("authentication/username-setup-page.html"),
        community: page("community/community-feed-page.html"),
        messages: page("community/messages/messages-page.html"),
        profile: page("community/profile-user/user-profile.html"),
        games: page("games/index.html"),
        gravityTourist: page("games/gravity-tourist/index.html"),
        admin: page("admin/admin-dashboard-page.html")
      }
    }
  },
  plugins: [{
    name: "vhht-pwa-root-files",
    async closeBundle() {
      await mkdir(resolve(root, "dist"), { recursive: true });
      await mkdir(resolve(root, "dist/shared/assets/brand"), { recursive: true });
      await Promise.all([
        "manifest.webmanifest",
        "service-worker.js",
        ".nojekyll"
      ].map(file => copyFile(resolve(root, file), resolve(root, "dist", file))));
      await Promise.all([
        "vhht-logo-mark.png",
        "vhht-logo-horizontal.png",
        "vhht-favicon.png"
      ].map(file => copyFile(
        resolve(root, "shared/assets/brand", file),
        resolve(root, "dist/shared/assets/brand", file)
      )));
    }
  }]
});
