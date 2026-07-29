import {
  InflectionEngine,
  InflectionRunInput,
  InflectionRunResult,
} from "@/fishtongue/application/ports/InflectionEngine";
import {
  EngineProgressEvent,
  LexurgyEngineError,
  LexurgyEngineErrorCode,
  LexurgyEngineStatus,
  SoundChangeEngine,
  SoundChangeRunInput,
  SoundChangeRunResult,
  SoundChangeValidationInput,
  ValidationResult,
} from "@/fishtongue/application/ports/SoundChangeEngine";
import { Channel, invoke } from "@tauri-apps/api/core";
import {
  WordGenerationEngine,
  WordGenerationInput,
  WordGenerationResult,
  WordGenerationValidationResult,
} from "@/fishtongue/application/ports/WordGenerationEngine";
import { WordGenerationConfig } from "@/fishtongue/domain/models";

type CommandError = { code?: string; message?: string } | string;

export default class TauriLexurgyEngineAdapter
  implements SoundChangeEngine, InflectionEngine, WordGenerationEngine
{
  getStatus(): Promise<LexurgyEngineStatus> {
    return command("lexurgy_status");
  }

  ensureReady(): Promise<LexurgyEngineStatus> {
    return command("lexurgy_ensure_ready");
  }

  validate(input: SoundChangeValidationInput): Promise<ValidationResult> {
    return command("lexurgy_validate", { input });
  }

  async run(
    input: SoundChangeRunInput,
    onEvent: (event: EngineProgressEvent) => void,
    signal?: AbortSignal
  ): Promise<SoundChangeRunResult> {
    const events = new Channel<EngineProgressEvent>();
    events.onmessage = onEvent;
    const result = await cancellable<unknown>(
      command("lexurgy_run", { input, events }),
      signal
    );
    return normalizeSoundChangeRunResult(result);
  }

  inflect(
    input: InflectionRunInput,
    signal?: AbortSignal
  ): Promise<InflectionRunResult> {
    const request = {
      rules: serializeRules(input.rules),
      stemsAndCategories: input.stems.map((stem) => ({
        stem: stem.value,
        categories: Object.values(stem.categories),
      })),
    };
    return cancellable(command("lexurgy_inflect", { input: request }), signal);
  }

  validateProfile(
    profile: WordGenerationConfig
  ): Promise<WordGenerationValidationResult> {
    return command("lexurgy_validate_wordgen", {
      input: { profileVersion: "wordgen-profile-v1", profile },
    });
  }

  generate(
    input: WordGenerationInput,
    signal?: AbortSignal
  ): Promise<WordGenerationResult> {
    return cancellable(
      command("lexurgy_generate_words", {
        input: {
          profileVersion: input.profile.configVersion,
          profile: input.profile.config,
          seed: input.seed,
          concepts: input.concepts.map((concept) => ({
            conceptKey: concept.conceptKey,
            gloss: concept.gloss,
          })),
          candidatesPerConcept: input.candidatesPerConcept,
        },
      }),
      signal
    );
  }
}

export function normalizeSoundChangeRunResult(
  raw: unknown
): SoundChangeRunResult {
  const result = isRecord(raw) ? raw : {};
  return {
    ruleNames: stringArray(result.ruleNames),
    outputWords: stringArray(result.outputWords),
    intermediateWords: stringArrayRecord(result.intermediateWords),
    traces: traceRecord(result.traces),
    errors: Array.isArray(result.errors)
      ? result.errors
          .filter(isRecord)
          .map((error) => ({
            message: String(error.message ?? "Lexurgy 无法处理这个单词。"),
            rule: optionalString(error.rule),
            originalWord: optionalString(error.originalWord),
            currentWord: optionalString(error.currentWord),
          }))
      : [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function stringArrayRecord(value: unknown): Record<string, string[]> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, items]) => [key, stringArray(items)])
  );
}

function traceRecord(
  value: unknown
): Record<string, Array<{ rule: string; output: string }>> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([word, trace]) => [
      word,
      Array.isArray(trace)
        ? trace
            .filter(isRecord)
            .map((step) => ({
              rule: String(step.rule ?? ""),
              output: String(step.output ?? ""),
            }))
        : [],
    ])
  );
}

function optionalString(value: unknown): string | undefined {
  return value == null ? undefined : String(value);
}

function serializeRules(rules: unknown): unknown {
  if (typeof rules === "string") {
    return { type: "form", form: rules };
  }
  if (!rules || typeof rules !== "object") return rules;
  if ("type" in rules) return rules;
  if ("branches" in rules) {
    const rawBranches = (rules as { branches: unknown }).branches;
    const entries =
      rawBranches instanceof Map
        ? [...rawBranches.entries()]
        : Object.entries(rawBranches as Record<string, unknown>);
    return {
      type: "split",
      branches: Object.fromEntries(
        entries.map(([category, branch]) => [category, serializeRules(branch)])
      ),
    };
  }
  if ("formula" in rules) {
    return { type: "formula", formula: (rules as { formula: unknown }).formula };
  }
  return rules;
}

async function cancellable<T>(
  operation: Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  if (!signal) return operation;
  if (signal.aborted) {
    await command<void>("lexurgy_cancel");
    throw new LexurgyEngineError("CANCELLED", "任务已取消。");
  }
  const abort = () => {
    void command<void>("lexurgy_cancel");
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    return await operation;
  } finally {
    signal.removeEventListener("abort", abort);
  }
}

async function command<T>(
  name: string,
  arguments_?: Record<string, unknown>
): Promise<T> {
  try {
    return await invoke<T>(name, arguments_);
  } catch (error) {
    const detail = error as CommandError;
    const code =
      typeof detail === "object" && detail?.code
        ? (detail.code as LexurgyEngineErrorCode)
        : "SIDECAR_CRASHED";
    const message =
      typeof detail === "string"
        ? detail
        : detail?.message ?? "Lexurgy 引擎通信失败。";
    throw new LexurgyEngineError(code, message);
  }
}
