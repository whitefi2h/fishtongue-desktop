import {
  EngineProgressEvent,
  LexurgyEngineError,
  LexurgyEngineStatus,
  SoundChangeEngine,
  SoundChangeRunInput,
  SoundChangeRunResult,
  SoundChangeValidationInput,
  ValidationResult,
} from "@/fishtongue/application/ports/SoundChangeEngine";

export default class SoundChangeService {
  constructor(private readonly soundChangeEngine: SoundChangeEngine) {}

  getEngineStatus(): Promise<LexurgyEngineStatus> {
    return this.soundChangeEngine.getStatus();
  }

  ensureReady(): Promise<LexurgyEngineStatus> {
    return this.soundChangeEngine.ensureReady();
  }

  validate(input: SoundChangeValidationInput): Promise<ValidationResult> {
    if (!input.changes.trim()) {
      throw new LexurgyEngineError("INVALID_REQUEST", "请输入要验证的音变规则。");
    }
    return this.soundChangeEngine.validate(input);
  }

  run(
    input: SoundChangeRunInput,
    onEvent: (event: EngineProgressEvent) => void,
    signal?: AbortSignal
  ): Promise<SoundChangeRunResult> {
    if (!input.changes.trim() || input.inputWords.length === 0) {
      throw new LexurgyEngineError(
        "INVALID_REQUEST",
        "运行音变前需要规则和至少一个输入词。"
      );
    }
    return this.soundChangeEngine.run(input, onEvent, signal);
  }
}
