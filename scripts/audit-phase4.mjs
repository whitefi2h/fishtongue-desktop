import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const root = process.cwd();
const failures = [];
const read = (relative) => readFileSync(path.join(root, relative), "utf8");

for (const file of [
  "src/fishtongue/ui/AiWorkspace.tsx",
  "src/fishtongue/application/services/AiAssistantService.ts",
  "src/fishtongue/application/services/ProjectAiContextBroker.ts",
]) {
  const content = read(file);
  for (const forbidden of ["fetch(", "axios", "localStorage", "window.alert", "window.confirm", "window.prompt"]) {
    if (content.includes(forbidden)) failures.push(`${file} contains forbidden capability: ${forbidden}`);
  }
}
const ui = read("src/fishtongue/ui/AiWorkspace.tsx");
if (ui.includes("@tauri-apps")) failures.push("AI UI directly imports Tauri");
const service = read("src/fishtongue/application/services/AiAssistantService.ts");
if (service.includes("@tauri-apps")) failures.push("AI application service directly imports Tauri");

const migration = read("src-tauri/migrations/0006_phase_4_ai_assistant.sql");
const publishedSchemaV6Sha384 =
  "1d0b57c7ec807a8d723cf97ab3ed3a462f3a9611206278159427ffb0e1f1e40fd281de5fa5c2b0e08aa90498c9a21196";
for (const required of [
  "ai_conversations", "ai_messages", "ai_proposals", "ai_context_audits",
  "execute_ai_turn_write", "json_valid", "TOO_MANY_AI_PROPOSALS",
]) {
  if (!migration.includes(required)) failures.push(`Schema v6 migration is missing ${required}`);
}
for (const forbidden of ["api_key", "authorization", "secret TEXT"]) {
  if (migration.toLowerCase().includes(forbidden)) failures.push(`Schema v6 stores a forbidden secret field: ${forbidden}`);
}
if (!migration.includes("json_array_length(NEW.proposals_json) > 5")) {
  failures.push("Published Schema v6 migration was modified; released migrations must remain immutable");
}
if (createHash("sha384").update(migration).digest("hex") !== publishedSchemaV6Sha384) {
  failures.push("Published Schema v6 migration checksum no longer matches released projects");
}
const proposalLimitRepair = read("src-tauri/migrations/0007_phase_4_proposal_limit.sql");
if (!proposalLimitRepair.includes("json_array_length(NEW.proposals_json) > 50")) {
  failures.push("Schema v7 proposal-limit repair does not enforce the 50-proposal boundary");
}

const capabilities = read("src-tauri/capabilities/default.json");
for (const forbidden of ["http:", "shell:", "fs:"]) {
  if (capabilities.includes(forbidden)) failures.push(`WebView capability unexpectedly contains ${forbidden}`);
}

const out = path.join(root, "out");
if (statSafe(out)?.isDirectory()) {
  for (const file of walk(out)) {
    if (!/\.(js|html|json|txt|css)$/.test(file)) continue;
    const content = readFileSync(file, "utf8");
    for (const forbidden of ["sk-proj-", "AIzaSy", "Authorization: Bearer", "/api/services"]) {
      if (content.includes(forbidden)) failures.push(`Static output ${path.relative(root, file)} contains ${forbidden}`);
    }
  }
}

if (failures.length) {
  console.error(failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}
console.log("Phase 4 architecture, capability, and secret audit passed.");

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
