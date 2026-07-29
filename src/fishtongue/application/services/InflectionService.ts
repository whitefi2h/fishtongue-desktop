import {
  InflectionEngine,
  InflectionRunInput,
  InflectionRunResult,
} from "@/fishtongue/application/ports/InflectionEngine";
import {
  LexurgyEngineError,
  LexurgyEngineStatus,
} from "@/fishtongue/application/ports/SoundChangeEngine";

export default class InflectionService {
  constructor(private readonly engine: InflectionEngine) {}

  getEngineStatus(): Promise<LexurgyEngineStatus> {
    return this.engine.getStatus();
  }

  ensureReady(): Promise<LexurgyEngineStatus> {
    return this.engine.ensureReady();
  }

  inflect(
    input: InflectionRunInput,
    signal?: AbortSignal
  ): Promise<InflectionRunResult> {
    if (!input.rules || input.stems.length === 0) {
      throw new LexurgyEngineError(
        "INVALID_REQUEST",
        "运行屈折前需要规则和至少一个测试词干。"
      );
    }
    if (!isInflectionRule(input.rules)) {
      throw new LexurgyEngineError(
        "INVALID_REQUEST",
        "屈折规则结构无效。请使用编辑器生成规则，或让 AI 重新生成符合 FishTongue 格式的提案。"
      );
    }
    return this.engine.inflect(input, signal);
  }
}

function isInflectionRule(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.type === "form") return typeof value.form === "string";
  if (value.type === "formula") return isFormula(value.formula);
  if (value.type === "split") {
    return isRecord(value.branches)
      && Object.values(value.branches).length > 0
      && Object.values(value.branches).every(isInflectionRule);
  }
  return false;
}

function isFormula(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.type === "stem") return true;
  if (value.type === "form") return typeof value.form === "string";
  return value.type === "concat"
    && Array.isArray(value.parts)
    && value.parts.length > 0
    && value.parts.every(isFormula);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
