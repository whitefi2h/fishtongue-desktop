import SoundChangeService from "@/fishtongue/application/services/SoundChangeService";
import InflectionService from "@/fishtongue/application/services/InflectionService";
import TauriLexurgyEngineAdapter from "@/fishtongue/infrastructure/TauriLexurgyEngineAdapter";
import ProjectSessionService from "@/fishtongue/application/services/ProjectSessionService";
import TauriDatabaseSession from "@/fishtongue/infrastructure/TauriDatabaseSession";
import TauriProjectFileAdapter from "@/fishtongue/infrastructure/TauriProjectFileAdapter";
import TauriRecentProjectStore from "@/fishtongue/infrastructure/TauriRecentProjectStore";
import {
  SqliteEvolutionRepository,
  SqliteLanguageRepository,
  SqliteLexemeRepository,
  SqliteInflectionRepository,
  SqliteProjectRepository,
} from "@/fishtongue/infrastructure/SqliteRepositories";
import TauriDesktopWindowAdapter from "@/fishtongue/infrastructure/TauriDesktopWindowAdapter";
import WordGenerationService from "@/fishtongue/application/services/WordGenerationService";
import {
  SqliteConceptListRepository,
  SqliteGenerationBatchRepository,
  SqliteMorphemeRepository,
  SqliteWordGenerationProfileRepository,
} from "@/fishtongue/infrastructure/Phase3Repositories";
import SqliteAiConversationRepository from "@/fishtongue/infrastructure/AiRepositories";
import TauriAiProviderAdapter from "@/fishtongue/infrastructure/TauriAiProviderAdapter";
import TauriAiProviderConfigStore from "@/fishtongue/infrastructure/TauriAiProviderConfigStore";
import ProjectAiContextBroker from "@/fishtongue/application/services/ProjectAiContextBroker";
import AiAssistantService from "@/fishtongue/application/services/AiAssistantService";
import AiProposalService from "@/fishtongue/application/services/AiProposalService";
import { AiApplication } from "@/fishtongue/application/ports/AiPorts";

export function createDesktopSoundChangeService(): SoundChangeService {
  const soundChangeEngine = new TauriLexurgyEngineAdapter();
  return new SoundChangeService(soundChangeEngine);
}

export function createDesktopInflectionService(): InflectionService {
  return new InflectionService(new TauriLexurgyEngineAdapter());
}

export function createDesktopWordGenerationService(): WordGenerationService {
  return new WordGenerationService(new TauriLexurgyEngineAdapter());
}

export function createDesktopProjectApplication(): ProjectSessionService {
  const database = new TauriDatabaseSession();
  return createProjectApplication(database);
}

function createProjectApplication(database: TauriDatabaseSession): ProjectSessionService {
  return new ProjectSessionService(
    new TauriProjectFileAdapter(),
    database,
    new SqliteProjectRepository(database),
    new SqliteLanguageRepository(database),
    new SqliteLexemeRepository(database),
    new SqliteEvolutionRepository(database),
    new SqliteInflectionRepository(database),
    new SqliteMorphemeRepository(database),
    new SqliteWordGenerationProfileRepository(database),
    new SqliteConceptListRepository(database),
    new SqliteGenerationBatchRepository(database),
    new TauriRecentProjectStore()
  );
}

export function createDesktopApplications(): {
  project: ProjectSessionService;
  ai: AiApplication;
} {
  const database = new TauriDatabaseSession();
  const project = createProjectApplication(database);
  const repository = new SqliteAiConversationRepository(database);
  const wordGeneration = createDesktopWordGenerationService();
  const proposals = new AiProposalService(project, repository, wordGeneration);
  const ai = new AiAssistantService(
    new TauriAiProviderAdapter(),
    new TauriAiProviderConfigStore(),
    repository,
    new ProjectAiContextBroker(project),
    project,
    proposals
  );
  return { project, ai };
}

export function createDesktopWindowPort(): TauriDesktopWindowAdapter {
  return new TauriDesktopWindowAdapter();
}
