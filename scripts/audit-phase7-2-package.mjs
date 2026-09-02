import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const directory = join(
  root,
  "src-tauri",
  "target",
  "release",
  "bundle",
  "nsis"
);
const expectedName = "FishTongue_0.7.0-phase.7.2_x64-setup.exe";
const name = existsSync(directory)
  ? readdirSync(directory).find((value) => value === expectedName)
  : undefined;
if (!name) throw new Error("Phase 7.2 NSIS installer was not produced");
const installer = join(directory, name);
if (statSync(installer).size === 0)
  throw new Error("Phase 7.2 installer is empty");
const configuration = JSON.parse(
  readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8")
);
if (configuration.version !== "0.7.0-phase.7.2")
  throw new Error("Packaged application version is not Phase 7.2");
const bytes = readFileSync(installer);
const hash = createHash("sha256").update(bytes).digest("hex").toUpperCase();
console.log(
  `Phase 7.2 package audit passed. File: ${name}. Size: ${bytes.length} bytes. SHA-256: ${hash}`
);
