import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const read = (relative) => readFileSync(path.join(root, relative), "utf8");

const uiFiles = [
  "src/fishtongue/ui/LexiconWorkspace.tsx",
  "src/fishtongue/ui/Phase3Workspaces.tsx",
];
for (const file of uiFiles) {
  const content = read(file);
  for (const forbidden of ["@tauri-apps", "fetch(", "axios", "localStorage", "window.alert", "window.confirm", "window.prompt"]) {
    if (content.includes(forbidden)) failures.push(`${file} directly references forbidden capability: ${forbidden}`);
  }
  if (content.includes("prototypeProject")) failures.push(`${file} imports prototype project data`);
}

const migration = read("src-tauri/migrations/0003_phase_3_lexicon_wordgen.sql");
for (const required of [
  "word_generation_profiles",
  "generation_candidates",
  "lexicon_batch_operations",
  "execute_generation_commit",
  "execute_generation_undo",
  "UNDO_CONFLICT",
]) {
  if (!migration.includes(required)) failures.push(`Schema v3 migration is missing ${required}`);
}
const acceptanceFix = read("src-tauri/migrations/0004_phase_3_acceptance_fixes.sql");
for (const required of [
  "review_deleted_at",
  "SET status = 'pending'",
  "prepare_generation_recommit",
]) {
  if (!acceptanceFix.includes(required)) failures.push(`Phase 3 acceptance migration is missing ${required}`);
}
const reviewFix = read("src-tauri/migrations/0005_phase_3_review_workflow.sql");
for (const required of [
  "generation_candidate_bulk_write_commands",
  "idx_batch_operations_batch",
  "status = 'draft'",
]) {
  if (!reviewFix.includes(required)) failures.push(`Phase 3 review migration is missing ${required}`);
}
const workspace = read("src/fishtongue/ui/Phase3Workspaces.tsx");
for (const required of ["取消生成", "全部接受", "取消全选", "提交本次已接受项", "删除候选列表"]) {
  if (!workspace.includes(required)) failures.push(`Phase 3 workspace is missing ${required}`);
}

const lock = JSON.parse(read("engine/engine-lock.json"));
if (lock.protocolVersion !== 2) failures.push("Engine protocol is not locked to v2");
if (lock.engineVersion !== "1.7.6-fishtongue.2") failures.push("Unexpected Phase 3 engine version");

const concepts = read("src/fishtongue/data/BuiltInConceptLists.ts");
if (!concepts.includes("swadesh-classic-v1")) failures.push("Built-in concept data is not versioned");

const out = path.join(root, "out");
if (statSafe(out)?.isDirectory()) {
  for (const file of walk(out)) {
    if (!/\.(js|html|json|txt|css)$/.test(file)) continue;
    const content = readFileSync(file, "utf8");
    for (const forbidden of ["/api/services", "0.0.0.0:8080", "Authorization: Bearer"]) {
      if (content.includes(forbidden)) failures.push(`Static output ${path.relative(root, file)} contains ${forbidden}`);
    }
  }
}

if (failures.length) {
  console.error(failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}
console.log("Phase 3 architecture and static audit passed.");

function statSafe(file) {
  try { return statSync(file); } catch { return undefined; }
}
function* walk(directory) {
  for (const entry of readdirSync(directory)) {
    const file = path.join(directory, entry);
    if (statSync(file).isDirectory()) yield* walk(file);
    else yield file;
  }
}
