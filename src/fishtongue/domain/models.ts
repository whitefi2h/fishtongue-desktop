export type UtcTimestamp = string;

export interface Project {
  id: string;
  name: string;
  createdAt: UtcTimestamp;
  updatedAt: UtcTimestamp;
}

export interface Language {
  id: string;
  projectId: string;
  name: string;
  createdAt: UtcTimestamp;
  updatedAt: UtcTimestamp;
}

export interface Sense {
  id: string;
  definition: string;
  position: number;
}

export interface Lexeme {
  id: string;
  languageId: string;
  romanized: string;
  partOfSpeech: string;
  createdAt: UtcTimestamp;
  updatedAt: UtcTimestamp;
  senses: Sense[];
}

export interface EvolutionTestWord {
  id: string;
  word: string;
  position: number;
}

export interface Evolution {
  id: string;
  languageId: string;
  soundChanges: string;
  updatedAt: UtcTimestamp;
  testWords: EvolutionTestWord[];
}

export interface ProjectManifest {
  formatVersion: number;
  databaseSchemaVersion: number;
  projectId: string;
  name: string;
  createdAt: UtcTimestamp;
  updatedAt: UtcTimestamp;
  appVersion: string;
}

export interface ProjectSession {
  manifest: ProjectManifest;
  sourcePath?: string;
  requiresSaveAs: boolean;
  recovered: boolean;
}

export interface RecoveryCandidate {
  manifest: ProjectManifest;
  sourcePath?: string;
}

export interface RecentProject {
  projectId: string;
  name: string;
  path: string;
  lastOpenedAt: UtcTimestamp;
}

