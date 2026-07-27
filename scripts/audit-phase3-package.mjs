import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const resources = join(root, "src-tauri", "target", "release", "resources", "lexurgy");
const installer = join(root, "src-tauri", "target", "release", "bundle", "nsis", "FishTongue_0.3.0-phase.3.1_x64-setup.exe");
const lock = JSON.parse(readFileSync(join(root, "engine", "engine-lock.json"), "utf8"));
const required = [
  "fishtongue-engine.jar",
  "runtime/bin/javaw.exe",
  "runtime/legal/java.base/LICENSE",
  "LEXURGY_LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "ENGINE_VERSION.json",
  "engine-lock.json",
  "runtime-manifest.json",
  "sbom.cyclonedx.json",
  "sbom.cyclonedx.xml",
];

for (const relative of required) {
  const file = join(resources, ...relative.split("/"));
  if (!existsSync(file) || statSync(file).size === 0) throw new Error(`Missing packaged resource: ${relative}`);
}
const jarHash = createHash("sha256").update(readFileSync(join(resources, "fishtongue-engine.jar"))).digest("hex").toUpperCase();
if (jarHash !== lock.fatJarSha256.toUpperCase()) throw new Error(`Packaged engine hash mismatch: ${jarHash}`);
if (readdirSync(join(resources, "runtime", "legal")).length < lock.runtime.modules.length) throw new Error("Runtime legal directory is incomplete");
if (!existsSync(installer) || statSync(installer).size === 0) throw new Error("Phase 3 NSIS installer was not produced");

const installerHash = createHash("sha256").update(readFileSync(installer)).digest("hex").toUpperCase();
console.log(`Phase 3 package audit passed. Installer SHA-256: ${installerHash}`);
