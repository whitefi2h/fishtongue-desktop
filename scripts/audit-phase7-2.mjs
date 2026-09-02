import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const read = (relative) => readFileSync(path.join(root, relative), "utf8");
const requireFile = (relative) => {
  if (!existsSync(path.join(root, relative))) failures.push(`Missing ${relative}`);
};

for (const file of [
  "docs/phase-7-2/evolution-workspace-plan.md",
  "docs/phase-7-2/risk-register.md",
  "docs/phase-7-2/manual-acceptance-guide.md",
  "docs/phase-7-2/acceptance-report.md",
  "src-tauri/migrations/0017_phase_7_evolution_workbench.sql",
  "src/fishtongue/application/services/EvolutionApplicationService.ts",
  "src/fishtongue/infrastructure/Phase7EvolutionRepositories.ts",
  "src/fishtongue/ui/EvolutionWorkbench.tsx",
]) requireFile(file);

const migration = read("src-tauri/migrations/0017_phase_7_evolution_workbench.sql");
for (const required of [
  "evolution_plans", "evolution_plan_versions", "evolution_runs", "evolution_run_items",
  "evolution_deliveries", "evolution_delivery_items", "execute_evolution_delivery_commit",
  "new_descendant", "phonological", "orthographic",
]) if (!migration.includes(required)) failures.push(`Schema v17 is missing ${required}`);

const migrations = read("src-tauri/src/migrations.rs");
if (!migrations.includes("DATABASE_SCHEMA_VERSION: u32 = 17")) failures.push("Current schema is not v17");
for (const required of [
  "schema_v17_migrates_the_legacy_editor_once", "schema_v17_commits_a_delivery_to_a_new_stage",
]) if (!migrations.includes(required)) failures.push(`Schema v17 test is missing ${required}`);

const history = read("src-tauri/src/project_history.rs");
for (const table of [
  "evolution_plans", "evolution_plan_versions", "evolution_runs", "evolution_run_items",
  "evolution_deliveries", "evolution_delivery_items",
]) if (!history.includes(`\"${table}\"`)) failures.push(`Project history does not track ${table}`);

const service = read("src/fishtongue/application/services/EvolutionApplicationService.ts");
for (const required of [
  "normalizeEngineInput", "inputOrigin", "createVersion", "reproduceRun", "rerunCurrent",
  "validateDelivery", "commitDelivery", "SOURCE_STALE", "TARGET_STALE", "NEW_PHONEME",
  "getGraphData",
]) if (!service.includes(required)) failures.push(`Evolution application is missing ${required}`);

const ui = read("src/fishtongue/ui/EvolutionWorkbench.tsx");
for (const required of [
  "方案与历史", "正式词典输入", "临时 IPA", "逐规则追踪", "批量保留来源拼写",
  "按原输入复现", "新的后代语言", "GenealogyCanvas", "演化图",
]) if (!ui.includes(required)) failures.push(`Evolution workbench is missing ${required}`);

const packageJson = JSON.parse(read("package.json"));
if (packageJson.version !== "0.7.0-phase.7.2") failures.push("Package version is not Phase 7.2");
if (!packageJson.scripts["verify:phase7-2"]) failures.push("verify:phase7-2 is missing");

if (failures.length) {
  console.error(failures.map((value) => `- ${value}`).join("\n"));
  process.exit(1);
}
console.log("Phase 7.2 schema, evolution application, workbench, history and graph audit passed.");
