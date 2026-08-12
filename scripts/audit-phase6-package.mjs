import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const bundleDirectory = join(root, "src-tauri", "target", "release", "bundle", "nsis");
const installerName = existsSync(bundleDirectory)
  ? readdirSync(bundleDirectory).find((name) => name.endsWith("-setup.exe") && name.includes("0.6.0"))
  : undefined;
if (!installerName) throw new Error("Phase 6 NSIS installer was not produced");
const installer = join(bundleDirectory, installerName);
if (statSync(installer).size === 0) throw new Error("Phase 6 installer is empty");

const analysisExecutable = join(root, "src-tauri", "resources", "fishtongue-analysis", "fishtongue-analysis.exe");
if (!existsSync(analysisExecutable)) throw new Error("PanPhon sidecar is missing from the installer resources");
for (const required of ["analysis-sbom.json", "analysis-sbom.sha256", "THIRD_PARTY_NOTICES.md", "licenses"]) {
  if (!existsSync(join(root, "src-tauri", "resources", "fishtongue-analysis", required))) {
    throw new Error(`PanPhon release metadata is missing: ${required}`);
  }
}
const nsisScript = join(root, "src-tauri", "target", "release", "nsis", "x64", "installer.nsi");
if (!existsSync(nsisScript)) throw new Error("Generated NSIS script is missing");
const nsisText = readFileSync(nsisScript, "utf8");
if (!nsisText.includes("resources\\fishtongue-analysis\\fishtongue-analysis.exe")) {
  throw new Error("PanPhon sidecar is not included in the installed resources layout");
}
const sbom = JSON.parse(readFileSync(join(root, "src-tauri", "resources", "fishtongue-analysis", "analysis-sbom.json"), "utf8"));
if (sbom.python !== "3.12.10" || !sbom.packages.some((value) => value.name.toLowerCase() === "panphon" && value.version === "0.22.2")) {
  throw new Error("PanPhon SBOM does not match the locked release runtime");
}
const bytes = readFileSync(installer);
const hash = createHash("sha256").update(bytes).digest("hex").toUpperCase();
console.log(`Phase 6 package audit passed. File: ${installerName}. Size: ${bytes.length} bytes. SHA-256: ${hash}`);
