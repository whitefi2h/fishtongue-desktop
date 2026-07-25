import fs from "fs";
import path from "path";

const FORBIDDEN_UI_IMPORTS = [
  "@tauri-apps",
  "@/fishtongue/infrastructure",
  "neo4j-driver",
  "next-auth",
];

describe("FishTongue architecture", () => {
  it("keeps infrastructure dependencies out of the UI layer", () => {
    const uiDirectory = path.join(process.cwd(), "src", "fishtongue", "ui");
    const uiSource = collectSourceFiles(uiDirectory)
      .map((fileName) => fs.readFileSync(fileName, "utf8"))
      .join("\n");

    for (const forbiddenImport of FORBIDDEN_UI_IMPORTS) {
      expect(uiSource).not.toContain(forbiddenImport);
    }
  });

  it("keeps browser-native prompts and ad-hoc visual tokens out of the desktop UI", () => {
    const uiDirectory = path.join(process.cwd(), "src", "fishtongue", "ui");
    const files = collectSourceFiles(uiDirectory);
    const source = files.map((fileName) => fs.readFileSync(fileName, "utf8")).join("\n");
    expect(source).not.toMatch(/window\.(alert|confirm|prompt)\s*\(/);

    const styleFiles = fs
      .readdirSync(uiDirectory)
      .filter((name) => name.endsWith(".css"))
      .map((name) => fs.readFileSync(path.join(uiDirectory, name), "utf8"))
      .join("\n");
    expect(styleFiles).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(styleFiles).not.toMatch(/z-index:\s*\d+/);
  });

  it("keeps the custom desktop window large enough for the full workspace", () => {
    const config = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "src-tauri", "tauri.conf.json"), "utf8"),
    );
    const desktopWindow = config.app.windows[0];
    expect(desktopWindow.minWidth).toBeGreaterThanOrEqual(1360);
    expect(desktopWindow.minHeight).toBeGreaterThanOrEqual(860);
  });
});

function collectSourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const pathName = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(pathName);
    return entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")
      ? [pathName]
      : [];
  });
}
