import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const installer = join(
  root,
  "src-tauri",
  "target",
  "release",
  "bundle",
  "nsis",
  "FishTongue_0.5.0-phase.5_x64-setup.exe"
);
if (!existsSync(installer) || statSync(installer).size === 0) {
  throw new Error("Phase 5 NSIS installer was not produced");
}
const bytes = readFileSync(installer);
const hash = createHash("sha256").update(bytes).digest("hex").toUpperCase();
console.log(
  `Phase 5 package audit passed. Size: ${bytes.length} bytes. SHA-256: ${hash}`
);
