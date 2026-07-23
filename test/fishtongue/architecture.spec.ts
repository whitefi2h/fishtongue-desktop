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
    const uiSource = fs
      .readdirSync(uiDirectory)
      .filter(
        (fileName) => fileName.endsWith(".ts") || fileName.endsWith(".tsx")
      )
      .map((fileName) =>
        fs.readFileSync(path.join(uiDirectory, fileName), "utf8")
      )
      .join("\n");

    for (const forbiddenImport of FORBIDDEN_UI_IMPORTS) {
      expect(uiSource).not.toContain(forbiddenImport);
    }
  });
});
