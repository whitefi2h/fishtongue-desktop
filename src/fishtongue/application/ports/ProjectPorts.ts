import {
  Evolution,
  ConceptList,
  GenerationBatch,
  GenerationCandidate,
  InflectionSystem,
  Language,
  LexiconBatchOperation,
  Lexeme,
  Morpheme,
  Project,
  WordGenerationProfile,
  ProjectSession,
  RecentProject,
  RecoveryCandidate,
} from "@/fishtongue/domain/models";

export interface ProjectFilePort {
  createProject(name: string, path?: string): Promise<ProjectSession | null>;
  openProject(path?: string): Promise<ProjectSession | null>;
  importProject(path?: string): Promise<ProjectSession | null>;
  saveProject(path?: string): Promise<ProjectSession | null>;
  chooseSavePath(name: string): Promise<string | null>;
  markDirty(): Promise<void>;
  inspectRecovery(): Promise<RecoveryCandidate | null>;
  recoverProject(): Promise<ProjectSession>;
  discardWorkspace(): Promise<void>;
}

export interface DatabaseSessionPort {
  open(): Promise<void>;
  close(): Promise<void>;
  select<T>(query: string, bindValues?: unknown[]): Promise<T[]>;
  execute(query: string, bindValues?: unknown[]): Promise<number>;
}

export interface ProjectRepository {
  get(projectId: string): Promise<Project | null>;
  upsert(project: Project): Promise<void>;
  rename(projectId: string, name: string, updatedAt: string): Promise<void>;
}

export interface LanguageRepository {
  list(projectId: string): Promise<Language[]>;
  create(language: Language): Promise<void>;
  rename(id: string, name: string, updatedAt: string): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface LexemeRepository {
  list(languageId: string): Promise<Lexeme[]>;
  save(lexeme: Lexeme): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface MorphemeRepository {
  list(languageId: string): Promise<Morpheme[]>;
  save(morpheme: Morpheme): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface WordGenerationProfileRepository {
  list(languageId: string): Promise<WordGenerationProfile[]>;
  save(profile: WordGenerationProfile): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface ConceptListRepository {
  list(projectId: string): Promise<ConceptList[]>;
  save(list: ConceptList): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface GenerationBatchRepository {
  list(languageId: string): Promise<GenerationBatch[]>;
  get(id: string): Promise<GenerationBatch | null>;
  create(batch: GenerationBatch): Promise<void>;
  saveCandidate(batchId: string, candidate: GenerationCandidate): Promise<void>;
  commit(batchId: string, operationId: string, committedAt: string): Promise<void>;
  listOperations(languageId: string): Promise<LexiconBatchOperation[]>;
  undo(operationId: string, undoneAt: string): Promise<void>;
}

export interface EvolutionRepository {
  getOrCreate(languageId: string): Promise<Evolution>;
  save(evolution: Evolution): Promise<void>;
}

export interface InflectionRepository {
  getOrCreate(languageId: string): Promise<InflectionSystem>;
  save(system: InflectionSystem): Promise<void>;
}

export interface RecentProjectStore {
  list(): Promise<RecentProject[]>;
  remember(project: RecentProject): Promise<void>;
  remove(path: string): Promise<void>;
}
