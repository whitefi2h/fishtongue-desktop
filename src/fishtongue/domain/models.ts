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

export type AiProviderKind =
  | "openai"
  | "gemini"
  | "deepseek"
  | "openai_compatible";
export type AiContextScope = "page" | "language" | "project";
export type AiMessageStatus = "complete" | "error" | "cancelled";
export type AiProposalKind =
  | "lexeme.upsert"
  | "morpheme.upsert"
  | "wordgen_profile.upsert"
  | "evolution.update_draft"
  | "inflection_system.update_draft";
export type AiProposalStatus =
  | "pending"
  | "staged"
  | "applied"
  | "rejected"
  | "stale";

export interface AiProviderConfig {
  id: string;
  name: string;
  kind: AiProviderKind;
  baseUrl: string;
  defaultModel: string;
  enabled: boolean;
  isDefault: boolean;
  privacyConsentVersion?: number;
  modelCache?: { values: AiModel[]; expiresAt: string };
}

export interface AiModel {
  id: string;
  label: string;
}

export interface AiConversation {
  id: string;
  projectId: string;
  languageId?: string;
  title: string;
  providerKind: AiProviderKind;
  providerLabel: string;
  modelId: string;
  contextScope: AiContextScope;
  allowExpansion: boolean;
  createdAt: UtcTimestamp;
  updatedAt: UtcTimestamp;
}

export interface AiMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  status: AiMessageStatus;
  providerKind: AiProviderKind;
  providerLabel: string;
  modelId: string;
  usage: Record<string, unknown>;
  createdAt: UtcTimestamp;
}

export interface AiContextReference {
  id: string;
  type: "page" | "language" | "lexeme" | "morpheme" | "evolution" | "inflection" | "wordgen";
  label: string;
  detail: string;
}

export interface AiProposal {
  id: string;
  messageId: string;
  kind: AiProposalKind;
  languageId: string;
  targetId?: string;
  baseSnapshotHash: string;
  patch: Record<string, unknown>;
  summary: string;
  status: AiProposalStatus;
  createdAt: UtcTimestamp;
  updatedAt: UtcTimestamp;
}

export interface AiContextAudit {
  id: string;
  messageId: string;
  providerKind: AiProviderKind;
  providerLabel: string;
  modelId: string;
  endpointLabel: string;
  contextScope: AiContextScope;
  context: Record<string, unknown>;
  references: AiContextReference[];
  toolCalls: unknown[];
  contextBytes: number;
  outcome: AiMessageStatus;
  errorCode?: string;
  createdAt: UtcTimestamp;
}

export interface AiConversationDetail {
  conversation: AiConversation;
  messages: AiMessage[];
  proposals: AiProposal[];
  audits: AiContextAudit[];
}

