import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const workspace = process.cwd();
const resourceRoot = join(
  workspace,
  "src-tauri",
  "target",
  "release",
  "resources",
  "lexurgy"
);
const installer = join(
  workspace,
  "src-tauri",
  "target",
  "release",
  "bundle",
  "nsis",
  "FishTongue_0.2.0-phase.2_x64-setup.exe"
);
const lock = JSON.parse(
  readFileSync(join(workspace, "engine", "engine-lock.json"), "utf8")
);

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

for (const relativePath of required) {
  const path = join(resourceRoot, ...relativePath.split("/"));
  if (!existsSync(path) || statSync(path).size === 0) {
    throw new Error(`Phase 2 package resource is missing or empty: ${relativePath}`);
  }
}

const jar = readFileSync(join(resourceRoot, "fishtongue-engine.jar"));
const jarHash = createHash("sha256").update(jar).digest("hex").toUpperCase();
if (jarHash !== lock.fatJarSha256.toUpperCase()) {
  throw new Error(`Packaged engine hash mismatch: ${jarHash}`);
}

const legalModules = readdirSync(join(resourceRoot, "runtime", "legal"));
if (legalModules.length < lock.runtime.modules.length) {
  throw new Error("The packaged runtime legal directory is incomplete.");
}
if (!existsSync(installer) || statSync(installer).size === 0) {
  throw new Error("The Phase 2 NSIS installer was not produced.");
}

console.log(
  `Phase 2 package audit passed (${required.length} resources, ${legalModules.length} legal module directories).`
);
