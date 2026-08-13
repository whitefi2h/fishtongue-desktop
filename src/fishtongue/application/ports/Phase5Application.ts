import {
  EtymologyRelation,
  HistoricalEvent,
  LanguageRelation,
  LanguageStage,
  ResolvedStageState,
  StageComponentOverride,
  StageContextRecord,
  StageEvolutionBatch,
  StageEvolutionCandidate,
  StageEvolutionOperation,
} from "@/fishtongue/domain/models";

export type EtymologyDuplicateKind =
  | "none"
  | "same_source_different_target"
  | "same_source_same_target_form";

export interface EtymologyDuplicateCheck {
  kind: EtymologyDuplicateKind;
  conflictingRelationId?: string;
  conflictingTargetLexemeId?: string;
  conflictingTargetForm?: string;
  targetForm?: string;
}

export interface BorrowingDuplicateInput {
  sourceLexemeId?: string;
  sourceForm: string;
  targetForm: string;
  excludeRelationId?: string;
}

export interface SaveEtymologyOptions {
  confirmSameSource?: boolean;
}

export type EtymologyDeletionMode =
  | "relation_only"
  | "relation_and_target_lexeme";

export interface Phase5Application {
  runProjectOperation?<T>(kind: string, summary: string, action: () => Promise<T>): Promise<T>;
  listStages(languageId: string): Promise<LanguageStage[]>;
  saveStage(stage: LanguageStage): Promise<void>;
  saveStageWithContext(
    stage: LanguageStage,
    context: StageContextRecord
  ): Promise<void>;
  deleteStage(id: string): Promise<void>;
  getStageContext(stageId: string): Promise<StageContextRecord | null>;
  saveStageContext(context: StageContextRecord): Promise<void>;
  saveStageOverride(value: StageComponentOverride): Promise<void>;
  deleteStageOverride(id: string): Promise<void>;
  listStageOverrides?(stageId: string): Promise<StageComponentOverride[]>;
  resolveStage(stageId: string): Promise<ResolvedStageState>;

  listLanguageRelations(): Promise<LanguageRelation[]>;
  saveLanguageRelation(relation: LanguageRelation): Promise<void>;
  deleteLanguageRelation(id: string): Promise<void>;

  listHistoricalEvents(): Promise<HistoricalEvent[]>;
  saveHistoricalEvent(event: HistoricalEvent): Promise<void>;
  deleteHistoricalEvent(id: string): Promise<void>;

  listEtymologyRelations(): Promise<EtymologyRelation[]>;
  listEtymologyForLexeme(lexemeId: string): Promise<EtymologyRelation[]>;
  checkEtymologyDuplicate(
    relation: EtymologyRelation
  ): Promise<EtymologyDuplicateCheck>;
  checkBorrowingDuplicate(
    input: BorrowingDuplicateInput
  ): Promise<EtymologyDuplicateCheck>;
  saveEtymologyRelation(
    relation: EtymologyRelation,
    options?: SaveEtymologyOptions
  ): Promise<void>;
  deleteEtymologyRelation(
    id: string,
    mode?: EtymologyDeletionMode
  ): Promise<void>;

  listStageEvolutionBatches(languageId: string): Promise<StageEvolutionBatch[]>;
  createStageEvolutionBatch(batch: StageEvolutionBatch): Promise<void>;
  saveStageEvolutionCandidate(
    batchId: string,
    candidate: StageEvolutionCandidate
  ): Promise<void>;
  commitStageEvolutionBatch(batchId: string): Promise<void>;
  listStageEvolutionOperations(languageId: string): Promise<StageEvolutionOperation[]>;
  undoStageEvolutionOperation(operationId: string): Promise<void>;
}
