import SoundChangeService from "@/fishtongue/application/services/SoundChangeService";
import UnavailableSoundChangeEngine from "@/fishtongue/infrastructure/UnavailableSoundChangeEngine";
import ProjectSessionService from "@/fishtongue/application/services/ProjectSessionService";
import TauriDatabaseSession from "@/fishtongue/infrastructure/TauriDatabaseSession";
import TauriProjectFileAdapter from "@/fishtongue/infrastructure/TauriProjectFileAdapter";
import TauriRecentProjectStore from "@/fishtongue/infrastructure/TauriRecentProjectStore";
import {
  SqliteEvolutionRepository,
  SqliteLanguageRepository,
  SqliteLexemeRepository,
  SqliteProjectRepository,
} from "@/fishtongue/infrastructure/SqliteRepositories";
import TauriDesktopWindowAdapter from "@/fishtongue/infrastructure/TauriDesktopWindowAdapter";

export function createDesktopSoundChangeService(): SoundChangeService {
  const soundChangeEngine = new UnavailableSoundChangeEngine();
  return new SoundChangeService(soundChangeEngine);
}

export function createDesktopProjectApplication(): ProjectSessionService {
  const database = new TauriDatabaseSession();
  return new ProjectSessionService(
    new TauriProjectFileAdapter(),
    database,
    new SqliteProjectRepository(database),
    new SqliteLanguageRepository(database),
    new SqliteLexemeRepository(database),
    new SqliteEvolutionRepository(database),
    new TauriRecentProjectStore()
  );
}

export function createDesktopWindowPort(): TauriDesktopWindowAdapter {
  return new TauriDesktopWindowAdapter();
}
