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
  profile?: LanguageProfile;
  createdAt: UtcTimestamp;
  updatedAt: UtcTimestamp;
}

export interface LanguageProfile {
  nativeName: string;
  code: string;
  aliases: string;
  description: string;
  tags: string;
  status: string;
  speakers: string;
  population: string;
  region: string;
  startLabel: string;
  endLabel: string;
  socialStatus: string;
  officialStatus: string;
  currentWritingSystem: string;
  historicalWritingSystems: string;
  orthographies: string;
  notes: string;
}

export type LanguageStageKind =
  | "internal_default"
  | "historical_stage"
  | "lightweight_dialect";
export type DocumentationStatus =
  | "recorded"
  | "partial"
  | "unrecorded"
  | "reconstructed";
export type StageStorageMode =
  | "inherited_delta"
  | "independent_snapshot"
  | "no_data";

export interface LanguageStage {
  id: string;
  languageId: string;
  name: string;
  kind: LanguageStageKind;
  documentationStatus: DocumentationStatus;
  storageMode: StageStorageMode;
  chronologyParentId?: string;
  dataBaseStageId?: string;
  startLabel: string;
  endLabel: string;
  position: number;
  visible: boolean;
  createdAt: UtcTimestamp;
  updatedAt: UtcTimestamp;
}

export interface StageContextRecord {
  stageId: string;
  background: string;
  evidenceNotes: string;
  sources: string[];
  updatedAt: UtcTimestamp;
}

export type StageComponentType =
  | "lexicon"
  | "morphemes"
  | "evolution"
  | "inflection"
  | "phonology"
  | "wordgen";
export type StageOverrideOperation = "replace" | "merge" | "remove";

export interface StageComponentOverride {
  id: string;
  stageId: string;
  componentType: StageComponentType;
  operation: StageOverrideOperation;
  targetId: string;
  payload: Record<string, unknown>;
  position: number;
  createdAt: UtcTimestamp;
  updatedAt: UtcTimestamp;
}

export type LanguageRelationKind = "genetic" | "contact" | "dialect";
export type EvidenceConfidence =
  | "confirmed"
  | "probable"
  | "possible"
  | "disputed";

export interface LanguageRelation {
  id: string;
  projectId: string;
  sourceLanguageId: string;
  targetLanguageId: string;
  sourceStageId?: string;
  targetStageId?: string;
  kind: LanguageRelationKind;
  isPrimary: boolean;
  confidence: EvidenceConfidence;
  notes: string;
  createdAt: UtcTimestamp;
  updatedAt: UtcTimestamp;
}

export type HistoricalEventType =
  | "migration"
  | "contact"
  | "split"
  | "standardization"
  | "political"
  | "cultural"
  | "other";

export interface HistoricalEventParticipant {
  languageId: string;
  stageId?: string;
  role: string;
  notes: string;
}

export interface HistoricalEvent {
  id: string;
  projectId: string;
  name: string;
  eventType: HistoricalEventType;
  startLabel: string;
  endLabel: string;
  description: string;
  position: number;
  createdAt: UtcTimestamp;
  updatedAt: UtcTimestamp;
  participants: HistoricalEventParticipant[];
}

export type EtymologyRelationKind =
  | "inheritance"
  | "borrowing"
  | "cognate"
  | "derivation"
  | "calque"
  | "unknown";

export interface EtymologyRelation {
  id: string;
  projectId: string;
  sourceLexemeId?: string;
  targetLexemeId: string;
  sourceStageId?: string;
  targetStageId?: string;
  historicalEventId?: string;
  kind: EtymologyRelationKind;
  sourceForm: string;
  confidence: EvidenceConfidence;
  notes: string;
  createdAt: UtcTimestamp;
  updatedAt: UtcTimestamp;
}

export interface ResolvedStageState {
  stage: LanguageStage;
  lineage: string[];
  components: {
    lexicon: Record<string, Record<string, unknown>>;
    morphemes: Record<string, Record<string, unknown>>;
    evolution?: Record<string, unknown>;
    inflection?: Record<string, unknown>;
    phonology?: Record<string, unknown>;
    wordgen: Record<string, Record<string, unknown>>;
  };
  warnings: string[];
}

export type PhonemeClass = "consonant" | "vowel" | "suprasegmental" | "other";
export type PhonemeRole = "phoneme" | "allophone";

export interface Phoneme {
  id: string;
  profileId: string;
  ipa: string;
  displaySymbol: string;
  category: PhonemeClass;
  role: PhonemeRole;
  parentPhonemeId?: string;
  distribution: string;
  source: string;
  notes: string;
  position: number;
}

export interface PhonologyProfile {
  id: string;
  languageId: string;
  structureVersion: "phonology-profile-v1";
  syllableTemplates: string[];
  legalOnsets: string[];
  legalNuclei: string[];
  legalCodas: string[];
  legalClusters: string[];
  forbiddenPatterns: string[];
  stressRules: Record<string, unknown>;
  toneRules: Record<string, unknown>;
  phonemes: Phoneme[];
  createdAt: UtcTimestamp;
  updatedAt: UtcTimestamp;
}

export interface BorrowingProfileConfig {
  explicitMappings: Array<{ source: string; targets: string[]; priority: number }>;
  distanceWeights: Record<string, number>;
  epenthesis: Array<{ phoneme: string; positions: string[] }>;
  deletionRules: string[];
  replacementRules: Array<{ pattern: string; replacement: string }>;
  repairOrder: Array<"replace" | "insert" | "delete" | "resyllabify">;
  stressStrategy: "preserve" | "target_default" | "none";
  toneStrategy: "preserve" | "target_default" | "none";
  morphology?: { morphemeIds: string[]; partOfSpeech?: string };
  candidateCount: number;
  maxSearchAttempts: number;
}

export interface BorrowingProfile {
  id: string;
  projectId: string;
  sourceLanguageId?: string;
  sourceStageId?: string;
  targetLanguageId: string;
  targetStageId?: string;
  name: string;
  structureVersion: "borrowing-profile-v1";
  isDefault: boolean;
  config: BorrowingProfileConfig;
  createdAt: UtcTimestamp;
  updatedAt: UtcTimestamp;
}

export type BorrowingBatchStatus = "draft" | "committed" | "discarded";
export type BorrowingCandidateStatus = "pending" | "accepted" | "rejected" | "committed";

export interface BorrowingCandidate {
  id: string;
  batchId: string;
  sourceLexemeId?: string;
  sourceForm: string;
  sourceIpa: string;
  adaptedForm: string;
  adaptedIpa: string;
  evolvedForm?: string;
  partOfSpeech: string;
  senses: Array<{ definition: string; position: number }>;
  morphemeIds: string[];
  trace: Array<Record<string, unknown>>;
  distance?: number;
  warnings: string[];
  explanation: string;
  status: BorrowingCandidateStatus;
  committedLexemeId?: string;
  committedRelationId?: string;
  position: number;
}

export interface BorrowingBatch {
  id: string;
  profileId: string;
  sourceLanguageId?: string;
  sourceStageId?: string;
  targetLanguageId: string;
  targetStageId?: string;
  sourceSnapshot: Record<string, unknown>[];
  phonologySnapshot: Record<string, unknown>;
  profileSnapshot: BorrowingProfileConfig;
  snapshotHash: string;
  panphonVersion: string;
  algorithmVersion: "borrowing-adaptation-v1";
  historicalEventId?: string;
  lexurgyStageChain: string[];
  llmModelLabel?: string;
  status: BorrowingBatchStatus;
  candidates: BorrowingCandidate[];
  createdAt: UtcTimestamp;
  updatedAt: UtcTimestamp;
}

export type StageEvolutionCandidateStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "committed";

export interface StageEvolutionCandidate {
  id: string;
  sourceLexemeId: string;
  sourceForm: string;
  resultForm: string;
  payload: Record<string, unknown>;
  status: StageEvolutionCandidateStatus;
  conflicts: GenerationConflict[];
  position: number;
}

export interface StageEvolutionBatch {
  id: string;
  languageId: string;
  sourceStageId: string;
  targetStageId: string;
  rulesSnapshot: string;
  inputSnapshot: Array<{ lexemeId: string; form: string }>;
  status: "draft" | "committed" | "undone";
  createdAt: UtcTimestamp;
  committedAt?: UtcTimestamp;
  candidates: StageEvolutionCandidate[];
}

export interface StageEvolutionOperation {
  id: string;
  batchId: string;
  createdAt: UtcTimestamp;
  undoneAt?: UtcTimestamp;
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
  | "inflection_system.update_draft"
  | "borrowing_adaptation.suggest";
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
  type:
    | "page"
    | "language"
    | "lexeme"
    | "morpheme"
    | "evolution"
    | "inflection"
    | "wordgen"
    | "language_stage"
    | "language_relation"
    | "historical_event"
    | "etymology";
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

