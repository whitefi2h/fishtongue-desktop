import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const read = (relative) => readFileSync(path.join(root, relative), "utf8");

for (const file of [
  "src/fishtongue/ui/HistoryWorkspaces.tsx",
  "src/fishtongue/application/services/HistoryApplicationService.ts",
  "src/fishtongue/application/services/StageStateResolver.ts",
]) {
  const content = read(file);
  for (const forbidden of [
    "@tauri-apps", "fetch(", "axios", "localStorage",
    "window.alert", "window.confirm", "window.prompt",
  ]) {
    if (content.includes(forbidden)) {
      failures.push(`${file} contains forbidden dependency: ${forbidden}`);
    }
  }
}

const migration = read("src-tauri/migrations/0008_phase_5_history_genealogy.sql");
for (const required of [
  "language_stages",
  "stage_component_overrides",
  "language_relations",
  "historical_events",
  "etymology_relations",
  "stage_evolution_batches",
  "stage_evolution_candidates",
  "stage_evolution_commit_commands",
  "stage_evolution_undo_commands",
  "idx_language_stages_internal_default",
  "idx_language_relations_primary_parent",
  "documentation_status = 'unrecorded' AND storage_mode = 'no_data'",
]) {
  if (!migration.includes(required)) failures.push(`Schema v8 is missing ${required}`);
}

const stageSaveRepair = read("src-tauri/migrations/0009_phase_5_stage_save_repair.sql");
for (const required of [
  "language_stage_write_commands",
  "execute_language_stage_write",
  "stage_context_records",
  "ON CONFLICT(stage_id) DO UPDATE",
]) {
  if (!stageSaveRepair.includes(required)) {
    failures.push(`Schema v9 stage-save repair is missing ${required}`);
  }
}

const released = [
  ["src-tauri/migrations/0008_phase_5_history_genealogy.sql",
    "11522f3075dae822c9a04f7accc1ca4465e4922a61f85c9db871114ac19acef7424f9071c62dffde50e168236a5ae72f"],
  ["src-tauri/migrations/0006_phase_4_ai_assistant.sql",
    "1d0b57c7ec807a8d723cf97ab3ed3a462f3a9611206278159427ffb0e1f1e40fd281de5fa5c2b0e08aa90498c9a21196"],
];
for (const [file, checksum] of released) {
  const current = createHash("sha384")
    .update(read(file).replace(/\r\n/g, "\n"))
    .digest("hex");
  if (current !== checksum) failures.push(`Released migration changed: ${file}`);
}

const registry = read("src/fishtongue/ui/prototype/registry.ts");
for (const route of ["genealogy", "events", "stages", "dialects", "contact"]) {
  const pattern = new RegExp(`id: "${route}"[^\\n]+state: "live"`);
  if (!pattern.test(registry)) failures.push(`${route} is not marked live`);
}

if (failures.length) {
  console.error(failures.map((value) => `- ${value}`).join("\n"));
  process.exit(1);
}
console.log("Phase 5 architecture, migration, and history-data audit passed.");
