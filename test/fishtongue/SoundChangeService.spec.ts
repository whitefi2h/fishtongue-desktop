import SoundChangeService from "@/fishtongue/application/services/SoundChangeService";
import UnavailableSoundChangeEngine from "@/fishtongue/infrastructure/UnavailableSoundChangeEngine";

describe("SoundChangeService", () => {
  it("reports that the engine is not connected without inventing a result", () => {
    const service = new SoundChangeService(new UnavailableSoundChangeEngine());

    const status = service.getEngineStatus();

    expect(status).toEqual({
      state: "unavailable",
      message: "规则运行与校验将在 Phase 2 接入本地 Lexurgy 引擎。",
    });
  });
});
