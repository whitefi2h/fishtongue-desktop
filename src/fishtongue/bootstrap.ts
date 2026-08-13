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
import { Phase5Application } from "@/fishtongue/application/ports/Phase5Application";
import HistoryApplicationService from "@/fishtongue/application/services/HistoryApplicationService";
import StageStateResolver from "@/fishtongue/application/services/StageStateResolver";
import {
  SqliteEtymologyRepository,
  SqliteHistoricalEventRepository,
  SqliteLanguageRelationRepository,
  SqliteLanguageStageRepository,
  SqliteStageEvolutionRepository,
} from "@/fishtongue/infrastructure/Phase5Repositories";
import { Phase6Application } from "@/fishtongue/application/ports/Phase6Application";
import Phase6ApplicationService from "@/fishtongue/application/services/Phase6ApplicationService";
import {
  SqliteBorrowingBatchRepository,
  SqliteBorrowingProfileRepository,
  SqlitePhonologyRepository,
} from "@/fishtongue/infrastructure/Phase6Repositories";
import TauriPhonologyAnalysisAdapter from "@/fishtongue/infrastructure/TauriPhonologyAnalysisAdapter";
import BorrowingAdaptationService from "@/fishtongue/application/services/BorrowingAdaptationService";
import TauriProjectHistoryAdapter from "@/fishtongue/infrastructure/TauriProjectHistoryAdapter";

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
    new TauriRecentProjectStore(),
    new TauriProjectHistoryAdapter()
  );
}

export function createDesktopApplications(): {
  project: ProjectSessionService;
  ai: AiApplication;
  history: Phase5Application;
  phase6: Phase6Application;
} {
  const database = new TauriDatabaseSession();
  const project = createProjectApplication(database);
  const stageRepository = new SqliteLanguageStageRepository(database);
  const phonologyRepository = new SqlitePhonologyRepository(database);
  const stageResolver = new StageStateResolver(
    stageRepository,
    new SqliteLexemeRepository(database),
    new SqliteMorphemeRepository(database),
    new SqliteEvolutionRepository(database),
    new SqliteInflectionRepository(database),
    new SqliteWordGenerationProfileRepository(database),
    phonologyRepository
  );
  const history = new HistoryApplicationService(
    project,
    stageRepository,
    new SqliteLanguageRelationRepository(database),
    new SqliteHistoricalEventRepository(database),
    new SqliteEtymologyRepository(database),
    new SqliteStageEvolutionRepository(database),
    stageResolver
  );
  const repository = new SqliteAiConversationRepository(database);
  const wordGeneration = createDesktopWordGenerationService();
  const proposals = new AiProposalService(
    project,
    repository,
    wordGeneration,
    createDesktopSoundChangeService()
  );
  const ai = new AiAssistantService(
    new TauriAiProviderAdapter(),
    new TauriAiProviderConfigStore(),
    repository,
    new ProjectAiContextBroker(project, history),
    project,
    proposals
  );
  const analysis = new TauriPhonologyAnalysisAdapter();
  const borrowingBatches = new SqliteBorrowingBatchRepository(database);
  const phase6 = new Phase6ApplicationService(
    phonologyRepository,
    new SqliteBorrowingProfileRepository(database),
    borrowingBatches,
    stageRepository,
    () => project.markProjectChanged(),
    analysis,
    new BorrowingAdaptationService(
      analysis,
      borrowingBatches,
      createDesktopSoundChangeService()
    ),
    stageResolver,
    history
  );
  return { project, ai, history, phase6 };
}

export function createDesktopWindowPort(): TauriDesktopWindowAdapter {
  return new TauriDesktopWindowAdapter();
}
