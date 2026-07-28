import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const installer = join(root, "src-tauri", "target", "release", "bundle", "nsis", "FishTongue_0.4.0-phase.4_x64-setup.exe");
if (!existsSync(installer) || statSync(installer).size === 0) {
  throw new Error("Phase 4 NSIS installer was not produced");
}
const bytes = readFileSync(installer);
const text = bytes.toString("latin1");
for (const marker of ["sk-proj-", "AIzaSy", "Authorization: Bearer"]) {
  if (text.includes(marker)) throw new Error(`Installer contains credential marker: ${marker}`);
}
const hash = createHash("sha256").update(bytes).digest("hex").toUpperCase();
console.log(`Phase 4 package audit passed. Installer SHA-256: ${hash}`);
