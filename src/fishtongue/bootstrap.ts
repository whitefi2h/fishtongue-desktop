import SoundChangeService from "@/fishtongue/application/services/SoundChangeService";
import UnavailableSoundChangeEngine from "@/fishtongue/infrastructure/UnavailableSoundChangeEngine";

export function createDesktopSoundChangeService(): SoundChangeService {
  const soundChangeEngine = new UnavailableSoundChangeEngine();
  return new SoundChangeService(soundChangeEngine);
}
