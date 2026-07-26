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
  ProjectSession,
  RecentProject,
  RecoveryCandidate,
  WordGenerationProfile,
} from "@/fishtongue/domain/models";

export interface ProjectSnapshot {
  session: ProjectSession;
  project: Project;
  languages: Language[];
  dirty: boolean;
  saveError?: string;
}

export interface ProjectApplication {
  createProject(name: string): Promise<ProjectSnapshot | null>;
  openProject(path?: string): Promise<ProjectSnapshot | null>;
  importProject(path?: string): Promise<ProjectSnapshot | null>;
  saveProject(): Promise<ProjectSnapshot>;
  saveProjectAs(): Promise<ProjectSnapshot | null>;
  closeProject(): Promise<void>;
  abandonProject(): Promise<void>;
  recoverProject(): Promise<ProjectSnapshot>;
  discardRecovery(): Promise<void>;
  inspectRecovery(): Promise<RecoveryCandidate | null>;
  listRecentProjects(): Promise<RecentProject[]>;
  listLanguages(): Promise<Language[]>;
  createLanguage(name: string): Promise<Language>;
  renameLanguage(id: string, name: string): Promise<void>;
  deleteLanguage(id: string): Promise<void>;
  listLexemes(languageId: string): Promise<Lexeme[]>;
  saveLexeme(lexeme: Lexeme): Promise<void>;
  deleteLexeme(id: string): Promise<void>;
  listMorphemes(languageId: string): Promise<Morpheme[]>;
  saveMorpheme(morpheme: Morpheme): Promise<void>;
  deleteMorpheme(id: string): Promise<void>;
  listWordGenerationProfiles(languageId: string): Promise<WordGenerationProfile[]>;
  saveWordGenerationProfile(profile: WordGenerationProfile): Promise<void>;
  deleteWordGenerationProfile(id: string): Promise<void>;
  listConceptLists(): Promise<ConceptList[]>;
  saveConceptList(list: ConceptList): Promise<void>;
  deleteConceptList(id: string): Promise<void>;
  listGenerationBatches(languageId: string): Promise<GenerationBatch[]>;
  createGenerationBatch(batch: GenerationBatch): Promise<void>;
  saveGenerationCandidate(batchId: string, candidate: GenerationCandidate): Promise<void>;
  commitGenerationBatch(batchId: string): Promise<void>;
  listLexiconBatchOperations(languageId: string): Promise<LexiconBatchOperation[]>;
  undoLexiconBatchOperation(operationId: string): Promise<void>;
  getEvolution(languageId: string): Promise<Evolution>;
  saveEvolution(evolution: Evolution): Promise<void>;
  getInflectionSystem(languageId: string): Promise<InflectionSystem>;
  saveInflectionSystem(system: InflectionSystem): Promise<void>;
  getSnapshot(): ProjectSnapshot | null;
}
