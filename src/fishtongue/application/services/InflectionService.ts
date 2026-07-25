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
    return this.engine.inflect(input, signal);
  }
}
