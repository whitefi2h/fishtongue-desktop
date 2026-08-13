import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const read = (relative) => readFileSync(path.join(root, relative), "utf8");
const requireFile = (relative) => {
  if (!existsSync(path.join(root, relative))) failures.push(`Missing ${relative}`);
};

for (const file of [
  "docs/phase-7-1/feature-entry-audit.md",
  "docs/phase-7-1/risk-register.md",
  "docs/phase-7-1/manual-acceptance-guide.md",
  "docs/phase-7-1/acceptance-report.md",
  "src-tauri/migrations/0016_phase_7_project_history.sql",
  "src-tauri/src/project_history.rs",
  "src/fishtongue/infrastructure/TauriProjectHistoryAdapter.ts",
]) requireFile(file);

const migration = read("src-tauri/migrations/0016_phase_7_project_history.sql");
for (const required of ["project_operations", "before_snapshot_json", "changes_json", "undone", "pending"]) {
  if (!migration.includes(required)) failures.push(`Schema v16 is missing ${required}`);
}

const rust = read("src-tauri/src/project_history.rs");
for (const required of [
  "begin_project_operation", "complete_project_operation", "abort_project_operation",
  "undo_project_operation", "redo_project_operation", "recover_pending_project_operations",
  "PROJECT_OPERATION_CONFLICT", "MAX_HISTORY_ITEMS",
]) if (!rust.includes(required)) failures.push(`Project history is missing ${required}`);

const migrations = read("src-tauri/src/migrations.rs");
if (!migrations.includes("DATABASE_SCHEMA_VERSION: u32 = 16")) failures.push("Current schema is not v16");

const session = read("src/fishtongue/application/services/ProjectSessionService.ts");
for (const required of ["runProjectOperation", "undoProjectOperation", "redoProjectOperation", "recoverPending"]) {
  if (!session.includes(required)) failures.push(`Project session is missing ${required}`);
}

const desktop = read("src/fishtongue/ui/FishTongueDesktopApp.tsx");
for (const required of [
  "Ctrl+Z", "Ctrl+Y", "isTextEditingTarget", "pendingScrollRestoreRef", "lexiconViewStates",
  "historyReplayRevision", 'stage.kind === "historical_stage"', "stageReadyLanguageId",
  "STAGE_LOAD_TIMEOUT_MS", "重新读取阶段", "setStageReadyLanguageId(created.id)",
]) {
  if (!desktop.includes(required)) failures.push(`Desktop navigation/history is missing ${required}`);
}

const lexicon = read("src/fishtongue/ui/LexiconWorkspace.tsx");
for (const required of [
  "listStageOverrides", "saveStageOverride", "storageMode === \"no_data\"", "本阶段", "继承",
  "disabled={saving || stageNoData}",
]) {
  if (!lexicon.includes(required)) failures.push(`Stage lexicon is missing ${required}`);
}

const registry = read("src/fishtongue/ui/prototype/registry.ts");
if (registry.includes('id: "global-undo"')) failures.push("Obsolete planned global-undo entry remains visible");

const packageJson = JSON.parse(read("package.json"));
if (packageJson.version !== "0.7.0-phase.7.1") failures.push("Package version is not Phase 7.1");
if (!packageJson.scripts["verify:phase7-1"]) failures.push("verify:phase7-1 is missing");

if (failures.length) {
  console.error(failures.map((value) => `- ${value}`).join("\n"));
  process.exit(1);
}
console.log("Phase 7.1 history, stage lexicon, navigation and documentation audit passed.");
