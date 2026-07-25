import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceFiles = [
  "src/fishtongue/ui/EngineWorkspaces.tsx",
  "src/fishtongue/application/ports/SoundChangeEngine.ts",
  "src/fishtongue/application/ports/InflectionEngine.ts",
  "src/fishtongue/infrastructure/TauriLexurgyEngineAdapter.ts",
  "src-tauri/capabilities/default.json",
  "src-tauri/tauri.conf.json",
];

const failures = [];
const adapter = read("src/fishtongue/infrastructure/TauriLexurgyEngineAdapter.ts");
if (!adapter.includes('command("lexurgy_')) failures.push("Tauri engine adapter does not use the locked command family");

const ui = read("src/fishtongue/ui/EngineWorkspaces.tsx");
for (const forbidden of ["@tauri-apps", "fetch(", "axios", "localStorage"]) {
  if (ui.includes(forbidden)) failures.push(`UI directly references forbidden capability: ${forbidden}`);
}

const capability = read("src-tauri/capabilities/default.json");
for (const forbidden of ["shell:", "http:", "fs:allow"]) {
  if (capability.includes(forbidden)) failures.push(`Frontend capability is too broad: ${forbidden}`);
}

const config = JSON.parse(read("src-tauri/tauri.conf.json"));
const productionCsp = config.app.security.csp.replaceAll("http://ipc.localhost", "");
if (/connect-src[^;]*(127\.0\.0\.1|localhost)/.test(productionCsp)) {
  failures.push("Production WebView CSP exposes localhost");
}

const out = path.join(root, "out");
if (statSafe(out)?.isDirectory()) {
  for (const file of walk(out)) {
    if (!/\.(js|html|json|txt|css)$/.test(file)) continue;
    const content = readFileSync(file, "utf8");
    for (const forbidden of ["/api/services", "0.0.0.0:8080", "Authorization: Bearer"]) {
      if (content.includes(forbidden)) failures.push(`Static output ${path.relative(root, file)} contains ${forbidden}`);
    }
  }
}

if (failures.length) {
  console.error(failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}
console.log(`Phase 2 audit passed (${sourceFiles.length} boundaries checked).`);

function read(relative) {
  return readFileSync(path.join(root, relative), "utf8");
}
function statSafe(file) {
  try { return statSync(file); } catch { return undefined; }
}
function* walk(directory) {
  for (const entry of readdirSync(directory)) {
    const file = path.join(directory, entry);
    if (statSync(file).isDirectory()) yield* walk(file);
    else yield file;
  }
}
