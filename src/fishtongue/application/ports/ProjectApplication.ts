import {
  Evolution,
  InflectionSystem,
  Language,
  Lexeme,
  Project,
  ProjectSession,
  RecentProject,
  RecoveryCandidate,
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
  getEvolution(languageId: string): Promise<Evolution>;
  saveEvolution(evolution: Evolution): Promise<void>;
  getInflectionSystem(languageId: string): Promise<InflectionSystem>;
  saveInflectionSystem(system: InflectionSystem): Promise<void>;
  getSnapshot(): ProjectSnapshot | null;
}
