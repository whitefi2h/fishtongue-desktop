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
  ipa: string;
  partOfSpeech: string;
  status: LexicalStatus;
  sourceType: LexemeSourceType;
  notes: string;
  createdAt: UtcTimestamp;
  updatedAt: UtcTimestamp;
  senses: Sense[];
  morphemes: LexemeMorpheme[];
}

export type LexicalStatus = "draft" | "confirmed" | "deprecated";
export type LexemeSourceType = "manual" | "generated" | "derived" | "imported";
export type MorphemeType =
  | "root"
  | "prefix"
  | "suffix"
  | "infix"
  | "circumfix"
  | "clitic"
  | "inflectional_ending";

export interface MorphemeCompositionRule {
  mode: "none" | "template" | "regex";
  template?: string;
  stemPattern?: string;
  replacement?: string;
}

export interface Morpheme {
  id: string;
  languageId: string;
  form: string;
  type: MorphemeType;
  meaning: string;
  applicablePartOfSpeech: string;
  status: LexicalStatus;
  compositionRule: MorphemeCompositionRule;
  notes: string;
  createdAt: UtcTimestamp;
  updatedAt: UtcTimestamp;
}

export interface LexemeMorpheme {
  morphemeId: string;
  position: number;
  role: string;
}

export interface WeightedSymbol {
  value: string;
  weight: number;
}

export interface PhonemeCategory {
  name: string;
  symbols: WeightedSymbol[];
}

export interface WeightedSyllableTemplate {
  pattern: string;
  weight: number;
}

export interface WeightedSyllableCount {
  count: number;
  weight: number;
}

export interface WordRewriteRule {
  pattern: string;
  replacement: string;
}

export interface WordGenerationConfig {
  categories: PhonemeCategory[];
  templates: WeightedSyllableTemplate[];
  syllableCounts: WeightedSyllableCount[];
  forbiddenPatterns: string[];
  rewriteRules: WordRewriteRule[];
  maxAttemptsPerCandidate: number;
}

export interface WordGenerationProfile {
  id: string;
  languageId: string;
  name: string;
  config: WordGenerationConfig;
  configVersion: "wordgen-profile-v1";
  isDefault: boolean;
  createdAt: UtcTimestamp;
  updatedAt: UtcTimestamp;
}

export interface Concept {
  id: string;
  conceptKey: string;
  gloss: string;
  position: number;
}

export interface ConceptList {
  id: string;
  projectId: string;
  name: string;
  source: string;
  sourceVersion: string;
  readonly: boolean;
  createdAt: UtcTimestamp;
  updatedAt: UtcTimestamp;
  concepts: Concept[];
}

export type GenerationBatchType = "basic" | "derivation";
export type GenerationBatchStatus = "draft" | "committed" | "undone";
export type CandidateStatus = "pending" | "accepted" | "rejected" | "committed";

export interface GenerationConflict {
  code: "DUPLICATE_LEXEME" | "DUPLICATE_CANDIDATE" | "ILLEGAL_FORM" | "MISSING_GLOSS";
  message: string;
}

export interface GenerationCandidate {
  id: string;
  position: number;
  conceptKey: string;
  gloss: string;
  romanized: string;
  ipa: string;
  partOfSpeech: string;
  status: CandidateStatus;
  conflicts: GenerationConflict[];
  sourceLexemeId?: string;
  morphemeId?: string;
  committedLexemeId: string;
  committedSenseId: string;
}

export interface GenerationBatch {
  id: string;
  languageId: string;
  type: GenerationBatchType;
  profileSnapshot: WordGenerationConfig;
  profileVersion: string;
  algorithmVersion: string;
  seed: string;
  inputSnapshot: Concept[];
  status: GenerationBatchStatus;
  createdAt: UtcTimestamp;
  committedAt?: UtcTimestamp;
  candidates: GenerationCandidate[];
}

export interface LexiconBatchOperation {
  id: string;
  languageId: string;
  batchId: string;
  kind: "generation_commit" | "derivation_commit";
  createdAt: UtcTimestamp;
  undoneAt?: UtcTimestamp;
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

export interface InflectionTestCase {
  id: string;
  stem: string;
  categories: Record<string, string>;
  position: number;
}

export interface InflectionSystem {
  id: string;
  languageId: string;
  rules: unknown;
  rulesVersion: number;
  updatedAt: UtcTimestamp;
  testCases: InflectionTestCase[];
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

