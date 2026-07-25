import SoundChangeService from "@/fishtongue/application/services/SoundChangeService";
import {
  EngineProgressEvent,
  LexurgyEngineStatus,
  SoundChangeEngine,
  SoundChangeRunInput,
  SoundChangeRunResult,
  SoundChangeValidationInput,
  ValidationResult,
} from "@/fishtongue/application/ports/SoundChangeEngine";

class MemoryEngine implements SoundChangeEngine {
  async getStatus(): Promise<LexurgyEngineStatus> {
    return { state: "stopped", message: "尚未启动" };
  }

  async ensureReady(): Promise<LexurgyEngineStatus> {
    return { state: "ready", message: "已就绪", engineVersion: "test" };
  }

  async validate(_: SoundChangeValidationInput): Promise<ValidationResult> {
    return { valid: true, ruleNames: ["Raise"] };
  }

  async run(
    input: SoundChangeRunInput,
    onEvent: (event: EngineProgressEvent) => void
  ): Promise<SoundChangeRunResult> {
    onEvent({ sequence: 1, type: "completed", message: "完成" });
    return {
      ruleNames: ["Raise"],
      outputWords: input.inputWords.map(() => "e"),
      intermediateWords: {},
      traces: {},
      errors: [],
    };
  }
}

describe("SoundChangeService", () => {
  it("delegates validation and preserves structured results", async () => {
    const service = new SoundChangeService(new MemoryEngine());
    await expect(service.validate({ changes: "Raise:\na => e" })).resolves.toEqual({
      valid: true,
      ruleNames: ["Raise"],
    });
  });

  it("rejects empty runs before starting the sidecar", () => {
    const service = new SoundChangeService(new MemoryEngine());
    expect(() =>
      service.run({ changes: "", inputWords: [], traceWords: [] }, () => undefined)
    ).toThrow("运行音变前需要规则和至少一个输入词");
  });
});
