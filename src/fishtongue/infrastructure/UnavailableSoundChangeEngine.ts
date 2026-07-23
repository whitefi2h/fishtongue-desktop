import {
  SoundChangeEngine,
  SoundChangeEngineStatus,
} from "@/fishtongue/application/ports/SoundChangeEngine";

const ENGINE_UNAVAILABLE_MESSAGE =
  "规则运行与校验将在 Phase 2 接入本地 Lexurgy 引擎。";

export default class UnavailableSoundChangeEngine implements SoundChangeEngine {
  getStatus(): SoundChangeEngineStatus {
    return {
      state: "unavailable",
      message: ENGINE_UNAVAILABLE_MESSAGE,
    };
  }
}
