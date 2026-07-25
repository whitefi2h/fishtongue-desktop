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

type CommandError = { code?: string; message?: string } | string;

export default class TauriLexurgyEngineAdapter
  implements SoundChangeEngine, InflectionEngine
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
    return cancellable(command("lexurgy_run", { input, events }), signal);
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
