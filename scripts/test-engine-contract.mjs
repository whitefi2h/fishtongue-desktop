import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import readline from "node:readline";

const jar = process.env.FISHTONGUE_ENGINE_JAR
  ?? path.resolve(process.cwd(), "../fishtongue-engine/desktop-api/build/libs/desktop-api-all.jar");
const java = process.env.FISHTONGUE_JAVA ?? "java";

if (!existsSync(jar)) {
  throw new Error(`Engine JAR not found: ${jar}`);
}

const token = randomBytes(32).toString("base64url");
const child = spawn(java, [
  "-jar", jar,
  "host=127.0.0.1",
  "port=0",
  "protocolVersion=2",
  `authToken=${token}`,
], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });

let stderr = "";
child.stderr.on("data", (chunk) => {
  stderr = `${stderr}${chunk}`.slice(-8_192);
});

const lines = readline.createInterface({ input: child.stdout });
const handshake = await Promise.race([
  new Promise((resolve, reject) => {
    lines.once("line", (line) => {
      try { resolve(JSON.parse(line)); } catch (error) { reject(error); }
    });
    child.once("exit", (code) => reject(new Error(`Engine exited during startup (${code}): ${stderr}`)));
  }),
  new Promise((_, reject) => setTimeout(() => reject(new Error("Engine handshake timed out")), 10_000)),
]);

if (handshake.event !== "ready" || handshake.protocolVersion !== 2) {
  throw new Error(`Unexpected handshake: ${JSON.stringify(handshake)}`);
}

const endpoint = `http://127.0.0.1:${handshake.port}`;
const request = async (route, init = {}) => {
  const response = await fetch(`${endpoint}${route}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(`${route} failed (${response.status}): ${text || stderr}`);
  return body;
};

try {
  const unauthorized = await fetch(`${endpoint}/health`);
  if (unauthorized.status !== 401) throw new Error("Health endpoint accepted a request without a token");

  const health = await request("/health");
  if (health.protocolVersion !== 2) throw new Error("Health protocol version mismatch");

  const validation = await request("/scv1/validate", {
    method: "POST",
    body: JSON.stringify({ changes: "Raise:\na => e" }),
  });
  if (!validation.ruleNames?.includes("Raise")) throw new Error("Validation did not return the rule name");

  const soundChange = await request("/scv1", {
    method: "POST",
    body: JSON.stringify({
      changes: "Raise:\na => e",
      inputWords: ["ama"],
      traceWords: ["ama"],
      allowPolling: false,
    }),
  });
  if (soundChange.outputWords?.[0] !== "eme") {
    throw new Error(`Unexpected sound-change output: ${JSON.stringify(soundChange)}`);
  }

  const inflection = await request("/inflectv1", {
    method: "POST",
    body: JSON.stringify({
      rules: {
        type: "formula",
        formula: {
          type: "concat",
          parts: [{ type: "stem" }, { type: "form", form: "s" }],
        },
      },
      stemsAndCategories: [{ stem: "ama", categories: [] }],
    }),
  });
  if (inflection.inflectedForms?.[0] !== "amas") {
    throw new Error(`Unexpected inflection output: ${JSON.stringify(inflection)}`);
  }

  const profile = {
    schemaVersion: "wordgen-profile-v1",
    categories: [
      { name: "C", symbols: [{ value: "k", weight: 1 }, { value: "th", weight: 1 }] },
      { name: "V", symbols: [{ value: "a", weight: 1 }, { value: "i", weight: 1 }] },
    ],
    templates: [{ pattern: "{C}{V}", weight: 1 }],
    syllableCounts: [{ count: 2, weight: 1 }],
    forbiddenPatterns: [],
    rewriteRules: [],
    maxAttemptsPerCandidate: 100,
  };
  const wordgenValidation = await request("/wordgenv1/validate", {
    method: "POST",
    body: JSON.stringify({ profileVersion: "wordgen-profile-v1", profile }),
  });
  if (!wordgenValidation.valid) {
    throw new Error(`Word-generation profile was rejected: ${JSON.stringify(wordgenValidation)}`);
  }

  const wordgenInput = {
    profileVersion: "wordgen-profile-v1",
    profile,
    seed: "20260726",
    concepts: [{ conceptKey: "water", gloss: "水" }, { conceptKey: "fire", gloss: "火" }],
    candidatesPerConcept: 3,
  };
  const generatedA = await request("/wordgenv1/generate", {
    method: "POST",
    body: JSON.stringify(wordgenInput),
  });
  const generatedB = await request("/wordgenv1/generate", {
    method: "POST",
    body: JSON.stringify(wordgenInput),
  });
  if (JSON.stringify(generatedA) !== JSON.stringify(generatedB)) {
    throw new Error("Word generation is not deterministic for the same seed and profile");
  }

  await request("/shutdown", { method: "POST", body: "{}" });
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Engine did not shut down")), 5_000)),
  ]);
  console.log(`Lexurgy contract passed: ${handshake.engineVersion} / protocol ${handshake.protocolVersion}`);
} finally {
  lines.close();
  if (child.exitCode === null) child.kill();
}
