import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const bundleDirectory = join(root, "src-tauri", "target", "release", "bundle", "nsis");
const installerName = existsSync(bundleDirectory)
  ? readdirSync(bundleDirectory).find((name) => name.endsWith("-setup.exe") && name.includes("0.7.0"))
  : undefined;
if (!installerName) throw new Error("Phase 7.1 NSIS installer was not produced");
const installer = join(bundleDirectory, installerName);
if (statSync(installer).size === 0) throw new Error("Phase 7.1 installer is empty");

const analysisExecutable = join(root, "src-tauri", "resources", "fishtongue-analysis", "fishtongue-analysis.exe");
if (!existsSync(analysisExecutable)) throw new Error("PanPhon sidecar is missing from the installer resources");
const nsisScript = join(root, "src-tauri", "target", "release", "nsis", "x64", "installer.nsi");
if (!existsSync(nsisScript)) throw new Error("Generated NSIS script is missing");
if (!readFileSync(nsisScript, "utf8").includes("resources\\fishtongue-analysis\\fishtongue-analysis.exe")) {
  throw new Error("PanPhon sidecar is not included in the installed resources layout");
}

const bytes = readFileSync(installer);
const hash = createHash("sha256").update(bytes).digest("hex").toUpperCase();
console.log(`Phase 7.1 package audit passed. File: ${installerName}. Size: ${bytes.length} bytes. SHA-256: ${hash}`);

