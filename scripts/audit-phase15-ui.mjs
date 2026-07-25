import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const uiRoot = path.join(root, "src", "fishtongue", "ui");
const walk = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });

const uiFiles = walk(uiRoot).filter((file) => /\.(tsx?|css)$/.test(file));
const failures = [];
for (const file of uiFiles) {
  const source = fs.readFileSync(file, "utf8");
  if (/window\.(alert|confirm|prompt)\s*\(/.test(source)) failures.push(`${file}: browser-native prompt`);
  if (file.endsWith(".css") && /#[0-9a-fA-F]{3,8}\b/.test(source)) failures.push(`${file}: raw color`);
  if (file.endsWith(".css") && /z-index:\s*\d+/.test(source)) failures.push(`${file}: numeric z-index`);
  if (/Georgia|radial-gradient|linear-gradient|backdrop-filter/.test(source)) failures.push(`${file}: prohibited visual style`);
  if (file.endsWith(".tsx") && /<[A-Z][A-Za-z0-9]*Icon(?![^>]*aria-hidden)[^>]*\/>/s.test(source)) {
    failures.push(`${file}: decorative icon exposed to assistive technology`);
  }
  if (file.endsWith(".tsx") && /<tr[^>]*(onClick|onDoubleClick)/s.test(source)) {
    failures.push(`${file}: non-semantic interactive table row`);
  }
}

const desktopUi = fs.readFileSync(path.join(uiRoot, "FishTongueDesktopApp.tsx"), "utf8");
const desktopCss = fs.readFileSync(path.join(uiRoot, "FishTongueDesktopApp.module.css"), "utf8");
if (!desktopUi.includes('aria-live="polite"')) failures.push("desktop status updates need an aria-live region");
if (!desktopCss.includes("color-scheme:light") || !desktopCss.includes("color-scheme:dark")) {
  failures.push("desktop themes must declare native control color schemes");
}
if (!desktopCss.includes(".searchField:focus-within") || !desktopCss.includes(".commandInput:focus-within")) {
  failures.push("compound search controls must retain a visible focus indicator");
}
if (!desktopCss.includes("overscroll-behavior:contain")) failures.push("modal scrolling must be contained");

const tauriConfig = JSON.parse(fs.readFileSync(path.join(root, "src-tauri", "tauri.conf.json"), "utf8"));
const windowConfig = tauriConfig.app.windows[0];
if (windowConfig.decorations !== false) failures.push("Tauri decorations must be false");
if (windowConfig.shadow !== true) failures.push("Tauri window shadow must remain enabled");
if (windowConfig.minWidth < 1360) failures.push("Tauri minimum width must protect the desktop workspace");
if (windowConfig.minHeight < 860) failures.push("Tauri minimum height must keep navigation and AI controls reachable");

const rust = fs.readFileSync(path.join(root, "src-tauri", "src", "lib.rs"), "utf8");
if (/\.menu\s*\(|on_menu_event|tauri::menu/.test(rust)) failures.push("native Tauri menu still present");

const tokens = fs.readFileSync(path.join(root, "design-system", "fishtongue", "tokens.css"), "utf8");
for (const token of ["--ft-size-titlebar", "--ft-size-menubar", "--ft-color-accent", "--ft-font-ui"]) {
  if (!tokens.includes(token)) failures.push(`missing locked token ${token}`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Phase 1.5 UI audit passed (${uiFiles.length} UI files).`);
