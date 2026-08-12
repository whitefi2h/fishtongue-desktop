import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const read = (relative) => readFileSync(path.join(root, relative), "utf8");

for (const file of [
  "src/fishtongue/ui/PhonologyWorkspace.tsx",
  "src/fishtongue/application/services/BorrowingAdaptationService.ts",
  "src/fishtongue/application/services/Phase6ApplicationService.ts",
]) {
  const content = read(file);
  for (const forbidden of ["@tauri-apps", "fetch(", "axios", "localStorage", "window.alert", "window.confirm", "window.prompt"]) {
    if (content.includes(forbidden)) failures.push(`${file} contains forbidden dependency: ${forbidden}`);
  }
}

const migration = read("src-tauri/migrations/0013_phase_6_phonology_borrowing.sql");
for (const required of [
  "phonology_profiles", "phonemes", "phonology_write_commands",
  "borrowing_profiles", "borrowing_batches", "borrowing_candidates",
  "borrowing_commit_commands", "execute_borrowing_commit",
]) {
  if (!migration.includes(required)) failures.push(`Schema v13 is missing ${required}`);
}

const tauri = JSON.parse(read("src-tauri/tauri.conf.json"));
if (!tauri.bundle.resources.some((value) => value.includes("fishtongue-analysis"))) {
  failures.push("Tauri bundle does not include the PanPhon analysis resource");
}

const packageJson = JSON.parse(read("package.json"));
if (!packageJson.scripts["verify:phase6"]) failures.push("verify:phase6 is missing");
for (const file of ["README.md", "AGENTS.md", ".context/CONTEXT.md", "docs/phase-6-development-plan.md"]) {
  const content = read(file);
  if (!content.includes("Morfessor") || !/(不属于|不做|不实现|移出|推迟)/.test(content)) {
    failures.push(`${file} must explicitly keep Morfessor out of Phase 6`);
  }
}

if (failures.length) {
  console.error(failures.map((value) => `- ${value}`).join("\n"));
  process.exit(1);
}
console.log("Phase 6 architecture, schema, sidecar and security audit passed.");
