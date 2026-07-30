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

export interface Phase5Application {
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
  resolveStage(stageId: string): Promise<ResolvedStageState>;

  listLanguageRelations(): Promise<LanguageRelation[]>;
  saveLanguageRelation(relation: LanguageRelation): Promise<void>;
  deleteLanguageRelation(id: string): Promise<void>;

  listHistoricalEvents(): Promise<HistoricalEvent[]>;
  saveHistoricalEvent(event: HistoricalEvent): Promise<void>;
  deleteHistoricalEvent(id: string): Promise<void>;

  listEtymologyRelations(): Promise<EtymologyRelation[]>;
  listEtymologyForLexeme(lexemeId: string): Promise<EtymologyRelation[]>;
  saveEtymologyRelation(relation: EtymologyRelation): Promise<void>;
  deleteEtymologyRelation(id: string): Promise<void>;

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
