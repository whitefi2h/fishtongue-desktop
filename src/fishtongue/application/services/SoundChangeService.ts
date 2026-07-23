import {
  SoundChangeEngine,
  SoundChangeEngineStatus,
} from "@/fishtongue/application/ports/SoundChangeEngine";

export default class SoundChangeService {
  constructor(private readonly soundChangeEngine: SoundChangeEngine) {}

  getEngineStatus(): SoundChangeEngineStatus {
    return this.soundChangeEngine.getStatus();
  }
}
